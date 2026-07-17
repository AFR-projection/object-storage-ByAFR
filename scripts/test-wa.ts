// Standalone test — verifies Baileys actually emits a QR string and a pairing code.
// Run: npx tsx scripts/test-wa.ts <phoneNumberDigits>
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "baileys";
import QRCode from "qrcode";
import { rm } from "fs/promises";

const phone = (process.argv[2] || "").replace(/\D/g, "");
const mode = process.argv[3] === "pairing" ? "pairing" : "qr";

async function main() {
  const dir = "./wa-sessions/__test__";
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  // useMultiFileAuthState is a Baileys utility, not a React hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[WA version] ${version.join(".")} isLatest=${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Storage ByAFR", "Chrome", "121.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  let pairingDone = false;
  sock.ev.on("connection.update", async (u) => {
    const { connection, qr, lastDisconnect } = u;
    console.log(`[event] connection=${connection} qr=${!!qr}`);

    if (mode === "pairing" && connection === "connecting" && !pairingDone && !state.creds.registered) {
      pairingDone = true;
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phone);
          console.log(`\n✅ PAIRING CODE: ${code}\n(buka WA → Perangkat Tertaut → Tautkan dgn nomor telepon)\n`);
        } catch (e) {
          console.error("❌ requestPairingCode error:", e);
        }
      }, 1500);
    }

    if (mode === "qr" && qr) {
      const dataUrl = await QRCode.toDataURL(qr);
      console.log(`\n✅ QR STRING length=${qr.length}, dataURL length=${dataUrl.length}`);
      console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
    }

    if (connection === "open") {
      console.log("\n🟢 CONNECTED! Login berhasil.\n");
      process.exit(0);
    }
    if (connection === "close") {
      console.log("[close]", (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode);
    }
  });
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
