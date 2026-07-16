import { db } from "@/lib/db";
import { otpTokens, users } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { generateOTP, hashOTP } from "./otp-utils";

const OTP_EXPIRY_MINUTES = 5;

export async function handleIncomingMessage(from: string, text: string) {
  const cleanPhone = from.replace(/\D/g, "");
  const message = text.trim().toUpperCase();

  // Only handle SAVE confirmation during registration
  if (message !== "SAVE") {
    return null;
  }

  // Check if user exists and is suspended (registration pending)
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, cleanPhone))
    .limit(1);

  if (!user || user.status !== "suspended") {
    return null;
  }

  // Check if OTP already pending for this number
  const [existingOtp] = await db
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

  if (existingOtp) {
    return "An OTP has already been sent to this number. Please check your WhatsApp.";
  }

  // Generate and send OTP
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(otpTokens).values({
    phoneNumber: cleanPhone,
    code: hashOTP(code),
    expiresAt,
  });

  const msg = `Your OTP code is:\n\n${code}\n\nThis code is valid for ${OTP_EXPIRY_MINUTES} minutes.\nDo not share this code with anyone.`;
  return msg;
}
