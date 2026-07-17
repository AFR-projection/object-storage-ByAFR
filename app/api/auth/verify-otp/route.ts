import { NextRequest } from "next/server";
import { eq, and, desc, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { otpTokens, users } from "@/lib/db/schema";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { hashOTP } from "@/lib/whatsapp/otp-utils";
import { createSession, getClientIp } from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/audit";

const verifySchema = z.object({
  phoneNumber: z.string().min(10),
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const body = verifySchema.parse(await request.json());
    const cleanPhone = body.phoneNumber.replace(/\D/g, "");

    const [otp] = await db
      .select()
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.phoneNumber, cleanPhone),
          eq(otpTokens.verified, false),
          gt(otpTokens.expiresAt, new Date())
        )
      )
      .orderBy(desc(otpTokens.createdAt))
      .limit(1);

    if (!otp) return apiError("OTP not found or expired", 404);

    if (otp.attemptCount >= 5) {
      return apiError("Too many attempts. Request new OTP.", 429);
    }

    if (hashOTP(body.code) !== otp.code) {
      await db
        .update(otpTokens)
        .set({ attemptCount: otp.attemptCount + 1 })
        .where(eq(otpTokens.id, otp.id));
      return apiError("OTP code is incorrect", 400);
    }

    await db
      .update(otpTokens)
      .set({ verified: true })
      .where(eq(otpTokens.id, otp.id));

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, cleanPhone))
      .limit(1);

    if (!user) return apiError("User not found", 404);

    await db
      .update(users)
      .set({ status: "active" })
      .where(eq(users.id, user.id));

    const ip = getClientIp(request);
    await createSession(user.id, ip, request.headers.get("user-agent") ?? undefined);

    await logActivity(user, "create_user", {
      ip,
      metadata: { registrationMethod: "whatsapp" },
    });

    return apiSuccess({
      user: { id: user.id, username: user.username, role: user.role },
      message: "Account activated",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
