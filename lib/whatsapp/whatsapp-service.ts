import { db } from "@/lib/db";
import { whatsappSenders, otpTokens } from "@/lib/db/schema";
import { eq, and, gt, lt, desc, or } from "drizzle-orm";
import { sendMessage, ensureConnected } from "./whatsapp-client";
import { generateOTP, hashOTP } from "./otp-utils";

const OTP_EXPIRY_MINUTES = 5;
const OTP_RATE_LIMIT_SECONDS = 60;

/**
 * Pick an active sender (round-robin by priority) and deliver a message.
 * Uses ensureConnected() so a sender whose socket was lost on a server restart
 * is transparently revived from its on-disk session before sending.
 */
async function deliver(phoneNumber: string, message: string): Promise<boolean> {
  const senders = await db
    .select()
    .from(whatsappSenders)
    .where(
      and(
        eq(whatsappSenders.isActive, true),
        or(eq(whatsappSenders.status, "connected"), eq(whatsappSenders.status, "connecting"))
      )
    )
    .orderBy(whatsappSenders.priority);

  for (const sender of senders) {
    const ready = await ensureConnected(sender.id, sender.phoneNumber);
    if (!ready) continue;
    const sent = await sendMessage(sender.id, phoneNumber, message);
    if (sent) return true;
  }
  return false;
}

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

  const sent = await deliver(
    cleanPhone,
    `Your OTP code is:\n\n${code}\n\nThis code is valid for ${OTP_EXPIRY_MINUTES} minutes.\nDo not share this code with anyone.`
  );

  return sent ? code : null;
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
  return deliver(phoneNumber.replace(/\D/g, ""), message);
}

export async function getActiveSenders() {
  return db
    .select()
    .from(whatsappSenders)
    .where(eq(whatsappSenders.isActive, true));
}

/**
 * True if the given phone number is registered as one of our WhatsApp senders.
 * A sender cannot deliver an OTP to itself: its own outgoing messages arrive
 * with key.fromMe=true, which the inbound handler (correctly) ignores, so the
 * "reply SAVE" step can never complete for a sender's own number.
 */
export async function isSenderNumber(phoneNumber: string): Promise<boolean> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const [hit] = await db
    .select({ id: whatsappSenders.id })
    .from(whatsappSenders)
    .where(eq(whatsappSenders.phoneNumber, cleanPhone))
    .limit(1);
  return !!hit;
}

export async function cleanupExpiredOTP() {
  await db.delete(otpTokens).where(lt(otpTokens.expiresAt, new Date()));
}
