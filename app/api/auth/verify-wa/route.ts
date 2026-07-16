import { NextRequest } from "next/server";
import { eq, and, desc, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { otpTokens } from "@/lib/db/schema";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const phoneNumber = request.nextUrl.searchParams.get("phone");
    if (!phoneNumber) return apiError("Phone number required", 400);

    const cleanPhone = phoneNumber.replace(/\D/g, "");

    const otp = await db
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

    if (otp.length > 0) {
      return apiSuccess({ status: "otp-sent" });
    }

    const verified = await db
      .select()
      .from(otpTokens)
      .where(
        and(eq(otpTokens.phoneNumber, cleanPhone), eq(otpTokens.verified, true))
      )
      .orderBy(desc(otpTokens.createdAt))
      .limit(1);

    if (verified.length > 0) {
      return apiSuccess({ status: "verified" });
    }

    return apiSuccess({ status: "pending" });
  } catch (error) {
    return handleApiError(error);
  }
}
