import { NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  getClientIp,
  destroySession,
  getSessionUser,
} from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/audit";
import { checkRateLimit } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import {
  createPending2faToken,
  verifyPending2faToken,
  verifyTotpCode,
  consumeRecoveryCode,
} from "@/lib/security/totp";

const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    totpCode: z.string().optional(),
    recoveryCode: z.string().optional(),
    pendingToken: z.string().optional(),
  })
  .refine((d) => !!d.pendingToken || (!!d.identifier && !!d.password), {
    message: "Credentials required",
  });

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    const ipRateLimit = await checkRateLimit(
      `login:${ip}`,
      MAX_FAILED_ATTEMPTS,
      LOCKOUT_DURATION_MS
    );

    if (!ipRateLimit.allowed) {
      return apiError(
        "Too many login attempts from this IP. Please try again after 15 minutes.",
        429,
        { code: "IP_RATE_LIMIT" }
      );
    }

    const body = await request.json();
    const { identifier, password, totpCode, recoveryCode, pendingToken } =
      loginSchema.parse(body);

    // Complete 2FA step with pending token (password already verified)
    if (pendingToken) {
      const pending = verifyPending2faToken(pendingToken);
      if (!pending) {
        return apiError("2FA session expired. Please sign in again.", 401, {
          code: "2FA_EXPIRED",
        });
      }

      const [pendingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, pending.userId))
        .limit(1);
      if (!pendingUser || pendingUser.status !== "active") {
        return apiError("Invalid credentials", 401);
      }

      let totpOk = false;
      if (totpCode && pendingUser.totpSecret) {
        totpOk = verifyTotpCode(pendingUser.totpSecret, totpCode);
      }
      if (!totpOk && recoveryCode) {
        const result = await consumeRecoveryCode(
          pendingUser.totpRecoveryCodes as string[] | null,
          recoveryCode
        );
        if (result.ok) {
          totpOk = true;
          await db
            .update(users)
            .set({ totpRecoveryCodes: result.remaining, updatedAt: new Date() })
            .where(eq(users.id, pendingUser.id));
        }
      }
      if (!totpOk) {
        return apiError("Invalid authentication code", 401, { code: "2FA_INVALID" });
      }

      await createSession(pendingUser.id, ip, userAgent);
      await logActivity(pendingUser, "login", {
        ip,
        metadata: { userAgent, success: true, via2fa: true },
      });

      return apiSuccess({
        user: {
          id: pendingUser.id,
          username: pendingUser.username,
          email: pendingUser.email,
          role: pendingUser.role,
        },
        mustChangePassword: pendingUser.mustChangePassword,
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier!), eq(users.email, identifier!)))
      .limit(1);

    if (user && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingMs = new Date(user.lockedUntil).getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return apiError(
        `Account is locked due to too many failed attempts. Please try again in ${remainingMin} minute(s).`,
        429,
        { code: "ACCOUNT_LOCKED" }
      );
    }

    // Suspended — clear message (not "invalid credentials")
    if (user && user.status === "suspended") {
      const reason = user.suspendReason?.trim();
      return apiError(
        reason
          ? `Your account has been suspended. Reason: ${reason}`
          : "Your account has been suspended. Contact an administrator.",
        403,
        { code: "ACCOUNT_SUSPENDED" }
      );
    }

    if (!user) {
      return apiError("Invalid credentials", 401);
    }

    const valid = await verifyPassword(password!, user.passwordHash);
    if (!valid) {
      const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
      const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;

      await db
        .update(users)
        .set({
          failedLoginAttempts: newAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : user.lockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await logActivity(user, "login", {
        ip,
        metadata: {
          userAgent,
          success: false,
          attempt: newAttempts,
          maxAttempts: MAX_FAILED_ATTEMPTS,
          locked: shouldLock,
        },
      });

      if (shouldLock) {
        await logActivity(user, "account_lock", {
          ip,
          metadata: { userAgent, attempts: newAttempts },
        });
        return apiError(
          "Account is locked due to too many failed attempts. Please try again after 15 minutes.",
          429,
          { code: "ACCOUNT_LOCKED" }
        );
      }

      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      return apiError(
        `Invalid credentials. ${remaining} attempt(s) remaining before account lock.`,
        401
      );
    }

    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    if (user.totpEnabled && user.totpSecret) {
      const token = createPending2faToken(user.id);
      return apiSuccess({
        requires2fa: true,
        pendingToken: token,
        message: "Enter your authenticator code to continue",
      });
    }

    await createSession(user.id, ip, userAgent);

    await logActivity(user, "login", {
      ip,
      metadata: { userAgent, success: true },
    });

    return apiSuccess({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const user = await getSessionUser();
    if (user) {
      await logActivity(user, "logout");
    }
    await destroySession();
    return apiSuccess({ message: "Logged out" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return apiError("Not authenticated", 401);
    }

    return apiSuccess({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      quotaBytes: user.quotaBytes,
      usedBytes: user.usedBytes,
      mustChangePassword: user.mustChangePassword,
      totpEnabled: user.totpEnabled,
      effectiveUserId: user.effectiveUserId,
      isImpersonating: user.isImpersonating,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
