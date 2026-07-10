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

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    // 1. IP-based rate limiting (5 attempts per 15 min window)
    const ipRateLimit = await checkRateLimit(
      `login:${ip}`,
      MAX_FAILED_ATTEMPTS,
      LOCKOUT_DURATION_MS
    );

    if (!ipRateLimit.allowed) {
      return apiError(
        "Too many login attempts from this IP. Please try again after 15 minutes.",
        429
      );
    }

    const body = await request.json();
    const { identifier, password } = loginSchema.parse(body);

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1);

    // 2. Check account lockout
    if (user && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingMs = new Date(user.lockedUntil).getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return apiError(
        `Account is locked due to too many failed attempts. Please try again in ${remainingMin} minute(s).`,
        429
      );
    }

    // 3. Validate credentials
    if (!user || user.status === "suspended") {
      return apiError("Invalid credentials", 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      // 4. Increment failed attempt counter
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

      // Log failed attempt
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
        return apiError(
          "Account is locked due to too many failed attempts. Please try again after 15 minutes.",
          429
        );
      }

      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      return apiError(
        `Invalid credentials. ${remaining} attempt(s) remaining before account lock.`,
        401
      );
    }

    // 5. Success — reset counter, create session (invalidates old ones)
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await createSession(user.id, ip, userAgent);

    await logActivity(user, "login", {
      ip,
      metadata: {
        userAgent,
        success: true,
      },
    });

    return apiSuccess({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
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
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        quotaBytes: user.quotaBytes,
        usedBytes: user.usedBytes,
        effectiveUserId: user.effectiveUserId,
        isImpersonating: user.isImpersonating,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
