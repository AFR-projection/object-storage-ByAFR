import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { otpTokens } from "@/lib/db/schema";
import { validateCsrf, checkRateLimit } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { sendOTP, normalizeEmail } from "@/lib/email/email-service";
import { getClientIp } from "@/lib/auth/session";

export const runtime = "nodejs";

const resendSchema = z.object({
  email: z.string().email(),
});

const OTP_RATE_LIMIT_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const body = resendSchema.parse(await request.json());
    const email = normalizeEmail(body.email);

    const limit = await checkRateLimit(`resend-otp:${email}`, 3, 5 * 60 * 1000);
    if (!limit.allowed) {
      return apiError("Too many resend attempts. Try again later.", 429);
    }

    const [recent] = await db
      .select()
      .from(otpTokens)
      .where(eq(otpTokens.email, email))
      .orderBy(desc(otpTokens.createdAt))
      .limit(1);

    if (recent) {
      const diffSeconds = (Date.now() - recent.createdAt.getTime()) / 1000;
      if (diffSeconds < OTP_RATE_LIMIT_SECONDS) {
        return apiError(
          `Please wait ${Math.ceil(OTP_RATE_LIMIT_SECONDS - diffSeconds)}s before resending`,
          429
        );
      }
    }

    const code = await sendOTP(email);
    if (!code) {
      return apiError("Failed to send the verification email. Please try again shortly.", 500);
    }

    return apiSuccess({ message: "Verification code emailed", email });
  } catch (error) {
    return handleApiError(error);
  }
}
