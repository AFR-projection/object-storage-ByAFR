import { db } from "@/lib/db";
import { whatsappSenders, otpTokens, waPairings } from "@/lib/db/schema";
import { eq, and, gt, lt, desc, or } from "drizzle-orm";
import { sendMessage, ensureConnected } from "./whatsapp-client";
import { generateOTP, hashOTP } from "./otp-utils";
import { otpInfo, otpCodeOnly } from "./templates";
import { ensureWhatsAppBootstrapped } from "./whatsapp-bootstrap";

const OTP_EXPIRY_MINUTES = 5;
const OTP_RATE_LIMIT_SECONDS = 60;
const PAIRING_EXPIRY_MINUTES = 15;

/**
 * Return ALL active senders that are (or can be revived to) connected, in
 * priority order. Used for failover: if the top sender's send fails, the caller
 * falls through to the next one instead of giving up.
 */
async function readySenderIds(): Promise<string[]> {
  // Belt-and-suspenders: if instrumentation did not run (or raced), restore
  // sockets from disk before picking a sender. Critical for inbound pairing
  // replies after a VPS restart.
  await ensureWhatsAppBootstrapped().catch(() => {});

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

  const ready: string[] = [];
  for (const sender of senders) {
    const ok = await ensureConnected(sender.id, sender.phoneNumber);
    if (ok) ready.push(sender.id);
  }
  return ready;
}

/**
 * Pick an active sender (round-robin by priority) and deliver a plain message,
 * failing over to the next ready sender if a send fails.
 * Uses ensureConnected() so a sender whose socket was lost on a server restart
 * is transparently revived from its on-disk session before sending.
 */
async function deliver(phoneNumber: string, message: string): Promise<boolean> {
  const ids = await readySenderIds();
  for (const senderId of ids) {
    if (await sendMessage(senderId, phoneNumber, message)) return true;
  }
  return false;
}

/**
 * Deliver an OTP as TWO plain-text messages from the SAME sender: an info
 * message, then the bare code on its own. We deliberately do NOT use WhatsApp's
 * interactive "Copy code" button here — Baileys is unofficial and many clients
 * render that as an undecodable "Waiting for this message" bubble, hiding the
 * code. A bare-code text message is universally readable and one-tap copyable.
 */
export async function deliverOtp(phoneNumber: string, code: string): Promise<boolean> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const ids = await readySenderIds();

  // Try each ready sender until one delivers BOTH messages. Both must come from
  // the same sender, so we only commit to a sender once its info message lands.
  for (const senderId of ids) {
    const infoOk = await sendMessage(senderId, cleanPhone, otpInfo(OTP_EXPIRY_MINUTES));
    if (!infoOk) continue; // sender is unhealthy for this recipient → next sender
    return sendMessage(senderId, cleanPhone, otpCodeOnly(code));
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

  const sent = await deliverOtp(cleanPhone, code);

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

/**
 * Create (or refresh) a pairing code for a number and return it. Any previous
 * unverified pairings for the number are cleared so only the newest code is live.
 */
export async function createPairing(phoneNumber: string): Promise<string> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + PAIRING_EXPIRY_MINUTES * 60 * 1000);

  await db.delete(waPairings).where(eq(waPairings.phoneNumber, cleanPhone));
  await db.insert(waPairings).values({ phoneNumber: cleanPhone, code, expiresAt });

  return code;
}

/**
 * Check whether `code` matches a live (unverified, unexpired) pairing for the
 * number. On match the pairing is marked verified and true is returned.
 */
export async function verifyPairing(phoneNumber: string, code: string): Promise<boolean> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const clean = code.replace(/\D/g, "");

  const [pairing] = await db
    .select()
    .from(waPairings)
    .where(
      and(
        eq(waPairings.phoneNumber, cleanPhone),
        eq(waPairings.verified, false),
        gt(waPairings.expiresAt, new Date())
      )
    )
    .orderBy(desc(waPairings.createdAt))
    .limit(1);

  if (!pairing || pairing.code !== clean) return false;

  await db.update(waPairings).set({ verified: true }).where(eq(waPairings.id, pairing.id));
  return true;
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
  await db.delete(waPairings).where(lt(waPairings.expiresAt, new Date()));
}
