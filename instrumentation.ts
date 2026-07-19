/**
 * Next.js server bootstrap — runs once when the Node process starts.
 * Restores Baileys WhatsApp sockets from on-disk sessions so OTP / inbound
 * pairing replies work after VPS restart without a manual /admin/whatsapp/init.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureWhatsAppBootstrapped } = await import(
      "@/lib/whatsapp/whatsapp-bootstrap"
    );
    // Fire-and-forget: initWAClient returns after wiring sockets; connection
    // "open" happens asynchronously. Do not block request readiness.
    void ensureWhatsAppBootstrapped().catch((err) => {
      console.error("[WA] startup bootstrap failed:", err);
    });
  } catch (err) {
    console.error("[WA] instrumentation import failed:", err);
  }
}
