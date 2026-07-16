import { NextRequest } from "next/server";
import { eq, and, gt, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { otpTokens } from "@/lib/db/schema";
import { validateCsrf, checkRateLimit } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { sendOTP } from "@/lib/whatsapp/whatsapp-service";
import { getClientIp } from "@/lib/auth/session";

const resendSchema = z.object({
  phoneNumber: z.string().min(10),
});

const OTP_RATE_LIMIT_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const body = resendSchema.parse(await request.json());
    const cleanPhone = body.phoneNumber.replace(/\D/g, "");

    const ip = getClientIp(request);
    const limit = await checkRateLimit(`resend-otp:${cleanPhone}`, 3, 5 * 60 * 1000);
    if (!limit.allowed) {
      return apiError("Too many resend attempts. Try again later.", 429);
    }

    const recent = await db
      .select()
      .from(otpTokens)
      .where(eq(otpTokens.phoneNumber, cleanPhone))
      .orderBy(desc(otpTokens.createdAt))
      .limit(1);

    if (recent.length > 0) {
      const lastOtp = recent[0];
      const diffSeconds = (Date.now() - lastOtp.createdAt.getTime()) / 1000;
      if (diffSeconds < OTP_RATE_LIMIT_SECONDS) {
        return apiError(
          `Please wait ${Math.ceil(OTP_RATE_LIMIT_SECONDS - diffSeconds)}s before resending`,
          429
        );
      }
    }

    const code = await sendOTP(cleanPhone);
    if (!code) {
      return apiError("Failed to send OTP. No WhatsApp sender available.", 500);
    }

    return apiSuccess({
      message: "OTP sent to WhatsApp",
      phoneNumber: cleanPhone,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
