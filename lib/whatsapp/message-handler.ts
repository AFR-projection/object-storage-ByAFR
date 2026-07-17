import { db } from "@/lib/db";
import { otpTokens, users } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { generateOTP, hashOTP } from "./otp-utils";
import { verifyPairing, deliverOtp } from "./whatsapp-service";

const OTP_EXPIRY_MINUTES = 5;

/**
 * Handle an inbound WhatsApp message during registration. The user proves
 * possession by replying with the pairing code shown in their browser (not a
 * static keyword). On a correct code we mark the pairing verified, issue an OTP,
 * and deliver it as two messages from within here. Returns a short text reply to
 * send back only in edge cases (e.g. an OTP is already live); normally null.
 */
export async function handleIncomingMessage(
  from: string,
  text: string
): Promise<string | null> {
  const cleanPhone = from.replace(/\D/g, "");
  const code = text.trim();

  // A pairing reply is a bare numeric code; ignore anything else quietly.
  if (!/^\d{4,8}$/.test(code)) return null;

  // Must correspond to a pending (suspended) registration for this number.
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, cleanPhone))
    .limit(1);

  if (!user || user.status !== "suspended") return null;

  // Validate the pairing code. Wrong/expired code → stay silent (avoid leaking
  // whether a code is close, and avoid replying to random numeric messages).
  const paired = await verifyPairing(cleanPhone, code);
  if (!paired) return null;

  // Avoid issuing a second OTP if one is already live.
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
    return "A verification code was already sent. Please check your messages.";
  }

  const otpCode = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await db.insert(otpTokens).values({
    phoneNumber: cleanPhone,
    code: hashOTP(otpCode),
    expiresAt,
  });

  // Deliver the two-message OTP (info + bare code). No extra acknowledgement is
  // returned — otpInfo already reads as the confirmation, keeping the thread to
  // exactly two clean messages instead of three.
  await deliverOtp(cleanPhone, otpCode);
  return null;
}
