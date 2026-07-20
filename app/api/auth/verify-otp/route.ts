import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { verifyOTP, normalizeEmail } from "@/lib/email/email-service";
import { createSession, getClientIp } from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/audit";

export const runtime = "nodejs";

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

/**
 * Verify an email OTP and activate the pending account. On success the user's
 * status flips to active and a session is created so they land straight in the app.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const body = verifySchema.parse(await request.json());
    const email = normalizeEmail(body.email);

    const ok = await verifyOTP(email, body.code);
    if (!ok) return apiError("OTP code is incorrect or expired", 400);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return apiError("User not found", 404);

    // Only PENDING-verification accounts may be activated here. A pending account
    // is "suspended" with a null reason (that's how register-email creates it).
    // An account an admin actively suspended carries a reason — activating it here
    // would let a suspended user self-lift their ban by re-verifying their email.
    if (user.status === "suspended" && user.suspendReason) {
      return apiError("This account has been suspended. Contact an administrator.", 403, {
        code: "ACCOUNT_SUSPENDED",
      });
    }

    if (user.status !== "active") {
      await db.update(users).set({ status: "active" }).where(eq(users.id, user.id));
    }

    const ip = getClientIp(request);
    await createSession(user.id, ip, request.headers.get("user-agent") ?? undefined);

    await logActivity(user, "create_user", {
      ip,
      metadata: { registrationMethod: "email" },
    });

    return apiSuccess({
      user: { id: user.id, username: user.username, role: user.role },
      message: "Account activated",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
