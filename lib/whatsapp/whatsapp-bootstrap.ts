import { existsSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { initWAClient, sessionsRoot } from "./whatsapp-client";

let bootstrapPromise: Promise<void> | null = null;

function credsPath(senderId: string) {
  return path.join(sessionsRoot(), senderId, "creds.json");
}

/**
 * Re-init every active sender that still has on-disk Baileys creds.
 * Senders without a session are marked disconnected so the admin UI
 * prompts a reconnect (QR / pairing) instead of silently failing sends.
 *
 * Safe to call multiple times — concurrent callers share one promise.
 */
export function ensureWhatsAppBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapWhatsAppClients().catch((err) => {
      // Allow retry when DB / filesystem was not ready yet on first boot.
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

/** Reset the bootstrap latch (used by admin /init after reconnect). */
export function resetWhatsAppBootstrapLatch() {
  bootstrapPromise = null;
}

export async function bootstrapWhatsAppClients() {
  try {
    const activeSenders = await db
      .select()
      .from(whatsappSenders)
      .where(eq(whatsappSenders.isActive, true));

    console.log(
      `[WA Bootstrap] Initializing ${activeSenders.length} WhatsApp client(s) (sessions: ${sessionsRoot()})`
    );

    let restored = 0;
    let missingSession = 0;

    for (const sender of activeSenders) {
      try {
        if (!existsSync(credsPath(sender.id))) {
          missingSession += 1;
          console.warn(
            `[WA Bootstrap] No session for ${sender.displayName} (${sender.phoneNumber}) — mark disconnected`
          );
          await db
            .update(whatsappSenders)
            .set({
              status: "disconnected",
              errorMessage:
                "Session missing after restart. Reconnect via Admin → WhatsApp (QR or pairing).",
              sessionData: null,
            })
            .where(eq(whatsappSenders.id, sender.id));
          continue;
        }

        await initWAClient(sender.id, sender.phoneNumber, false);
        restored += 1;
        console.log(
          `[WA Bootstrap] Restored ${sender.displayName} (${sender.phoneNumber})`
        );
      } catch (err) {
        console.error(`[WA Bootstrap] Failed to init ${sender.phoneNumber}:`, err);
        await db
          .update(whatsappSenders)
          .set({
            status: "error",
            errorMessage: String(err).slice(0, 300),
          })
          .where(eq(whatsappSenders.id, sender.id))
          .catch(() => {});
      }
    }

    console.log(
      `[WA Bootstrap] Complete — restored=${restored} missingSession=${missingSession}`
    );
  } catch (err) {
    console.error("[WA Bootstrap] Error:", err);
    throw err;
  }
}

export async function cleanupExpiredOTP() {
  try {
    const { otpTokens } = await import("@/lib/db/schema");
    const { lt } = await import("drizzle-orm");
    await db.delete(otpTokens).where(lt(otpTokens.expiresAt, new Date()));

    console.log(`[Cleanup] Removed expired OTP tokens`);
  } catch (err) {
    console.error("[Cleanup] Error:", err);
  }
}
