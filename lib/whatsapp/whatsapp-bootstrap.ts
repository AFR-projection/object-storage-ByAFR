import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { initWAClient } from "./whatsapp-client";

export async function bootstrapWhatsAppClients() {
  try {
    const activeSenders = await db
      .select()
      .from(whatsappSenders)
      .where(eq(whatsappSenders.isActive, true));

    console.log(`[WA Bootstrap] Initializing ${activeSenders.length} WhatsApp clients`);

    for (const sender of activeSenders) {
      try {
        await initWAClient(sender.id, sender.phoneNumber);
        console.log(`[WA Bootstrap] Initialized ${sender.displayName} (${sender.phoneNumber})`);
      } catch (err) {
        console.error(`[WA Bootstrap] Failed to init ${sender.phoneNumber}:`, err);
      }
    }

    console.log("[WA Bootstrap] Complete");
  } catch (err) {
    console.error("[WA Bootstrap] Error:", err);
  }
}

export async function cleanupExpiredOTP() {
  try {
    const { otpTokens } = await import("@/lib/db/schema");
    const { lt } = await import("drizzle-orm");
    await db
      .delete(otpTokens)
      .where(lt(otpTokens.expiresAt, new Date()));

    console.log(`[Cleanup] Removed expired OTP tokens`);
  } catch (err) {
    console.error("[Cleanup] Error:", err);
  }
}
