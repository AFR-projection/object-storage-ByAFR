import { NextRequest } from "next/server";
import { eq, and, desc, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { otpTokens, users } from "@/lib/db/schema";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const phoneNumber = request.nextUrl.searchParams.get("phone");
    if (!phoneNumber) return apiError("Phone number required", 400);

    const cleanPhone = phoneNumber.replace(/\D/g, "");

    // Registration state is driven by the USER, not by leftover OTP tokens.
    // A previous test run could leave a verified token for this number; keying
    // off that wrongly reported "verified" and bounced the user to /dashboard
    // (then /login) before they ever entered a code.
    const [user] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.phone, cleanPhone))
      .limit(1);

    if (!user) return apiSuccess({ status: "pending" });

    // Account activated => registration fully complete.
    if (user.status === "active") return apiSuccess({ status: "verified" });

    // Still pending: has a live (unexpired, unverified) OTP been issued yet?
    const [liveOtp] = await db
      .select({ id: otpTokens.id })
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

    return apiSuccess({ status: liveOtp ? "otp-sent" : "pending" });
  } catch (error) {
    return handleApiError(error);
  }
}
