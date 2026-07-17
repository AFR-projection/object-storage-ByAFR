import { NextRequest } from "next/server";
import { eq, or, and, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  getClientIp,
  destroySession,
  getSessionUser,
  AuthError,
} from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/audit";
import { peekRateLimit, checkRateLimit, resetRateLimit } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { notifyUser } from "@/lib/whatsapp/notify-user";
import { parseUserAgent } from "@/lib/access-tracking";
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

const ACCOUNT_MAX_FAILED = parseInt(process.env.RATE_LIMIT_LOGIN_MAX ?? "5", 10) || 5;
const LOCKOUT_WINDOW_MS =
  parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS ?? "900000", 10) || 15 * 60 * 1000;
const IP_MAX_FAILED = parseInt(process.env.RATE_LIMIT_LOGIN_IP_MAX ?? "30", 10) || 30;

const MSG_ACCOUNT_LOCKED =
  "This account has been temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.";
const MSG_IP_THROTTLE =
  "Too many login attempts from this IP address. Please try again in 15 minutes.";

async function recordIpFailure(ip: string, userId?: string) {
  const result = await checkRateLimit(`login:${ip}`, IP_MAX_FAILED, LOCKOUT_WINDOW_MS);
  if (!result.allowed) {
    if (userId) {
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (u) {
        await logActivity(u, "ip_rate_limit", {
          ip,
          metadata: { max: IP_MAX_FAILED, windowMs: LOCKOUT_WINDOW_MS },
        });
      }
    }
  }
  return result;
}

/** Human-readable device label from a user-agent, e.g. "Chrome on Windows 11". */
function deviceLabel(userAgent: string): string {
  const { browser, os } = parseUserAgent(userAgent);
  if (browser === "Unknown" && os === "Unknown") return "an unknown device";
  return `${browser} on ${os}`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    // Layer 2 peek — only block if already over threshold (do not count this request yet)
    const ipStatus = await peekRateLimit(`login:${ip}`, IP_MAX_FAILED, LOCKOUT_WINDOW_MS);
    if (!ipStatus.allowed) {
      return apiError(MSG_IP_THROTTLE, 429, { code: "IP_RATE_LIMIT" });
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
        await recordIpFailure(ip, pendingUser.id);
        return apiError("Invalid authentication code", 401, { code: "2FA_INVALID" });
      }

      const prior = await db
        .select({ ip: sessions.ip, userAgent: sessions.userAgent })
        .from(sessions)
        .where(and(eq(sessions.userId, pendingUser.id), gt(sessions.expiresAt, new Date())));

      const newDevice =
        prior.length === 0 ||
        !prior.some((s) => s.userAgent === userAgent) ||
        !prior.some((s) => s.ip === ip);

      await createSession(pendingUser.id, ip, userAgent);
      await resetRateLimit(`login:${ip}`, LOCKOUT_WINDOW_MS);

      await logActivity(pendingUser, "login", {
        ip,
        metadata: { userAgent, success: true, via2fa: true, newDevice },
      });

      if (newDevice) {
        void notifyUser(pendingUser.id, {
          type: "login",
          at: new Date(),
          ip,
          device: deviceLabel(userAgent),
        });
      }

      return apiSuccess({
        user: {
          id: pendingUser.id,
          username: pendingUser.username,
          email: pendingUser.email,
          role: pendingUser.role,
        },
        mustChangePassword: pendingUser.mustChangePassword,
        newDevice,
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier!), eq(users.email, identifier!)))
      .limit(1);

    // Unknown user — count toward IP throttle only
    if (!user) {
      const ipResult = await recordIpFailure(ip);
      if (!ipResult.allowed) {
        return apiError(MSG_IP_THROTTLE, 429, { code: "IP_RATE_LIMIT" });
      }
      return apiError("Invalid credentials", 401);
    }

    // Clear expired lock before counting again
    if (user.lockedUntil && new Date(user.lockedUntil) <= new Date()) {
      await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }

    // Layer 1 — account lock
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return apiError(MSG_ACCOUNT_LOCKED, 429, { code: "ACCOUNT_LOCKED" });
    }

    if (user.status === "suspended") {
      const reason = user.suspendReason?.trim();
      return apiError(
        reason
          ? `Your account has been suspended. Reason: ${reason}`
          : "Your account has been suspended. Contact an administrator.",
        403,
        { code: "ACCOUNT_SUSPENDED" }
      );
    }

    const valid = await verifyPassword(password!, user.passwordHash);
    if (!valid) {
      const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
      const shouldLock = newAttempts >= ACCOUNT_MAX_FAILED;

      await db
        .update(users)
        .set({
          failedLoginAttempts: newAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_WINDOW_MS) : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await logActivity(user, "login", {
        ip,
        metadata: {
          userAgent,
          success: false,
          attempt: newAttempts,
          maxAttempts: ACCOUNT_MAX_FAILED,
          locked: shouldLock,
        },
      });

      const ipResult = await recordIpFailure(ip, user.id);
      if (!ipResult.allowed) {
        return apiError(MSG_IP_THROTTLE, 429, { code: "IP_RATE_LIMIT" });
      }

      if (shouldLock) {
        await logActivity(user, "account_lock", {
          ip,
          metadata: { userAgent, attempts: newAttempts },
        });
        void notifyUser(user.id, {
          type: "account_locked",
          minutes: Math.round(LOCKOUT_WINDOW_MS / 60000),
        });
        return apiError(MSG_ACCOUNT_LOCKED, 429, { code: "ACCOUNT_LOCKED" });
      }

      const remaining = ACCOUNT_MAX_FAILED - newAttempts;
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

    const prior = await db
      .select({ ip: sessions.ip, userAgent: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())));

    const newDevice =
      prior.length === 0 ||
      !prior.some((s) => s.userAgent === userAgent) ||
      !prior.some((s) => s.ip === ip);

    await createSession(user.id, ip, userAgent);
    await resetRateLimit(`login:${ip}`, LOCKOUT_WINDOW_MS);

    await logActivity(user, "login", {
      ip,
      metadata: { userAgent, success: true, newDevice },
    });

    if (newDevice) {
      void notifyUser(user.id, {
        type: "login",
        at: new Date(),
        ip,
        device: deviceLabel(userAgent),
      });
    }

    return apiSuccess({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      mustChangePassword: user.mustChangePassword,
      newDevice,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    let user = null;
    try {
      user = await getSessionUser();
    } catch (err) {
      // Session may already be inactive/IP-revoked — still clear cookie
      if (!(err instanceof AuthError)) throw err;
    }
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
