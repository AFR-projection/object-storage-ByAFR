import { db } from "@/lib/db";
import { otpTokens } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { sendMessage } from "./whatsapp-client";
import { generateOTP, hashOTP } from "./otp-utils";

const OTP_EXPIRY_MINUTES = 5;

export async function handleIncomingMessage(from: string, text: string) {
  const cleanPhone = from.replace(/\D/g, "");
  const message = text.trim().toUpperCase();

  if (message !== "SAVE") return;

  const pending = await db
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

  if (pending.length > 0) {
    return;
  }

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(otpTokens).values({
    phoneNumber: cleanPhone,
    code: hashOTP(code),
    expiresAt,
  });

  const msg = `Kode OTP Anda adalah:\n\n${code}\n\nKode berlaku selama ${OTP_EXPIRY_MINUTES} menit.\nJangan berikan kode ini kepada siapa pun.`;
  return msg;
}
