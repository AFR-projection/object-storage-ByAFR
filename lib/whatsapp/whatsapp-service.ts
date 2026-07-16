import { db } from "@/lib/db";
import { whatsappSenders, otpTokens } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { sendMessage } from "./whatsapp-client";
import { generateOTP, hashOTP } from "./otp-utils";

const OTP_EXPIRY_MINUTES = 5;
const OTP_RATE_LIMIT_SECONDS = 60;

export async function sendOTP(phoneNumber: string): Promise<string | null> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");

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
      return null;
    }
  }

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(otpTokens).values({
    phoneNumber: cleanPhone,
    code: hashOTP(code),
    expiresAt,
  });

  const activeSenders = await db
    .select()
    .from(whatsappSenders)
    .where(and(eq(whatsappSenders.isActive, true), eq(whatsappSenders.status, "connected")))
    .orderBy(whatsappSenders.priority);

  for (const sender of activeSenders) {
    const sent = await sendMessage(
      sender.id,
      cleanPhone,
      `Kode OTP Anda adalah:\n\n${code}\n\nKode berlaku selama ${OTP_EXPIRY_MINUTES} menit.\nJangan berikan kode ini kepada siapa pun.`
    );
    if (sent) return code;
  }

  return null;
}

export async function verifyOTP(phoneNumber: string, code: string): Promise<boolean> {
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

  if (otp.length === 0) return false;

  const token = otp[0];
  if (token.attemptCount >= 5) return false;

  if (hashOTP(code) !== token.code) {
    await db
      .update(otpTokens)
      .set({ attemptCount: token.attemptCount + 1 })
      .where(eq(otpTokens.id, token.id));
    return false;
  }

  await db
    .update(otpTokens)
    .set({ verified: true })
    .where(eq(otpTokens.id, token.id));

  return true;
}

export async function sendCustomMessage(
  phoneNumber: string,
  message: string
): Promise<boolean> {
  const activeSenders = await db
    .select()
    .from(whatsappSenders)
    .where(and(eq(whatsappSenders.isActive, true), eq(whatsappSenders.status, "connected")))
    .orderBy(whatsappSenders.priority);

  for (const sender of activeSenders) {
    const sent = await sendMessage(sender.id, phoneNumber, message);
    if (sent) return true;
  }

  return false;
}

export async function getActiveSenders() {
  return db
    .select()
    .from(whatsappSenders)
    .where(eq(whatsappSenders.isActive, true));
}

export async function cleanupExpiredOTP() {
  await db
    .delete(otpTokens)
    .where(gt(otpTokens.expiresAt, new Date().toISOString() as any));
}
