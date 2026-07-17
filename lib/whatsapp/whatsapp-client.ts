import { Boom } from "@hapi/boom";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  isJidBroadcast,
} from "baileys";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

type WAStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WAInstance {
  id: string;
  phoneNumber: string;
  socket: ReturnType<typeof makeWASocket> | null;
  status: WAStatus;
  qrDataUrl: string | null;
  pairingCode: string | null;
}

const instances = new Map<string, WAInstance>();

function sessionDir(senderId: string) {
  return path.join(process.cwd(), "wa-sessions", senderId);
}

/**
 * Initialize a WhatsApp client.
 * @param usePairingCode when true, request an 8-digit pairing code for phoneNumber
 *        instead of a QR string (works headless without scanning).
 */
export async function initWAClient(
  senderId: string,
  phoneNumber: string,
  usePairingCode = false
): Promise<WAInstance> {
  // Tear down any existing socket for this sender first.
  const existing = instances.get(senderId);
  if (existing?.socket) {
    try {
      existing.socket.ev.removeAllListeners("connection.update");
      existing.socket.end(undefined);
    } catch {
      /* ignore */
    }
  }

  const dir = sessionDir(senderId);
  await mkdir(dir, { recursive: true });

  // useMultiFileAuthState is a Baileys utility, not a React hook — the
  // react-hooks/rules-of-hooks match here is a false positive.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  // Fetching the latest WhatsApp Web version is REQUIRED — a stale version makes
  // WhatsApp reject the connection with 405 before any QR/pairing code is emitted.
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Storage ByAFR", "Chrome", "121.0.0"],
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 30_000,
    connectTimeoutMs: 60_000,
    // Bound every query (onWhatsApp, sendMessage acks, init) so a half-open
    // socket fails fast instead of hanging the HTTP request behind it.
    defaultQueryTimeoutMs: 20_000,
    retryRequestDelayMs: 500,
    qrTimeout: usePairingCode ? undefined : 60_000,
  });

  const instance: WAInstance = {
    id: senderId,
    phoneNumber,
    socket,
    status: "connecting",
    qrDataUrl: null,
    pairingCode: null,
  };
  instances.set(senderId, instance);

  socket.ev.on("creds.update", saveCreds);

  const wantsPairing = usePairingCode && !state.creds.registered;
  let pairingRequested = false;

  async function requestPairing() {
    if (pairingRequested) return;
    pairingRequested = true;
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, "");
      const code = await socket.requestPairingCode(cleanPhone);
      instance.pairingCode = code;
      await db
        .update(whatsappSenders)
        .set({
          status: "connecting",
          sessionData: { pairingCode: code, generatedAt: Date.now() },
          errorMessage: null,
        })
        .where(eq(whatsappSenders.id, senderId));
      console.log(`[WA] Pairing code for ${cleanPhone}: ${code}`);
    } catch (err) {
      pairingRequested = false;
      console.error(`[WA] requestPairingCode failed:`, err);
      instance.status = "error";
      await db
        .update(whatsappSenders)
        .set({ status: "error", errorMessage: String(err).slice(0, 300) })
        .where(eq(whatsappSenders.id, senderId));
    }
  }

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // requestPairingCode needs the websocket to be open. The first
    // "connecting" update fires right after ws open — request it then.
    if (wantsPairing && connection === "connecting") {
      // small tick to ensure ws.isOpen is true before sending the node
      setTimeout(requestPairing, 1500);
    }

    if (qr && !usePairingCode) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        instance.qrDataUrl = qrDataUrl;
        await db
          .update(whatsappSenders)
          .set({
            status: "connecting",
            sessionData: { qrDataUrl, generatedAt: Date.now() },
            errorMessage: null,
          })
          .where(eq(whatsappSenders.id, senderId));
        console.log(`[WA] QR ready for ${phoneNumber}`);
      } catch (err) {
        console.error(`[WA] QR encode error:`, err);
      }
    }

    if (connection === "open") {
      instance.status = "connected";
      instance.qrDataUrl = null;
      instance.pairingCode = null;
      await db
        .update(whatsappSenders)
        .set({
          status: "connected",
          lastConnectedAt: new Date(),
          sessionData: null,
          errorMessage: null,
        })
        .where(eq(whatsappSenders.id, senderId));
      console.log(`[WA] Connected: ${phoneNumber}`);
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        instance.status = "disconnected";
        instances.delete(senderId);
        await rm(sessionDir(senderId), { recursive: true, force: true }).catch(() => {});
        await db
          .update(whatsappSenders)
          .set({ status: "disconnected", isActive: false, sessionData: null })
          .where(eq(whatsappSenders.id, senderId));
        console.log(`[WA] Logged out: ${phoneNumber}`);
        return;
      }

      // Restart required (e.g. after pairing) or transient network drop → reconnect.
      instance.status = "connecting";
      await db
        .update(whatsappSenders)
        .set({ status: "connecting" })
        .where(eq(whatsappSenders.id, senderId));
      setTimeout(() => {
        // On reconnect the creds are usually registered, so use normal (no pairing) flow.
        initWAClient(senderId, phoneNumber, false).catch((e) =>
          console.error(`[WA] reconnect failed:`, e)
        );
      }, 3000);
    }
  });

  socket.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const { handleIncomingMessage } = await import("./message-handler");
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe || isJidBroadcast(msg.key.remoteJid ?? ""))
          continue;
        const text =
          msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text || !msg.key.remoteJid) continue;

        // Baileys 6.7+ delivers many chats as @lid, where remoteJid holds the
        // LID (not the phone number). The real phone number is carried in the
        // separate senderPn field — prefer it, and only fall back to parsing
        // remoteJid when it's a normal @s.whatsapp.net user JID.
        const remoteJid = msg.key.remoteJid;
        const senderPn = (msg.key as { senderPn?: string }).senderPn;
        const phone = senderPn
          ? senderPn.split("@")[0]
          : remoteJid.endsWith("@s.whatsapp.net")
            ? remoteJid.split("@")[0]
            : null;
        if (!phone) {
          console.warn(`[WA] could not resolve phone from key:`, msg.key);
          continue;
        }

        const from = phone.replace(/\D/g, "");
        console.log(`[WA] incoming from ${from} (jid=${remoteJid}): ${text.slice(0, 40)}`);
        const reply = await handleIncomingMessage(from, text);
        // Reply (acknowledgement only) to the phone-number JID; fall back to the
        // original JID. Any OTP is delivered inside the handler as two messages.
        if (reply) {
          const replyTo = senderPn ?? remoteJid;
          const ok = await sendMessage(senderId, replyTo, reply);
          console.log(`[WA] reply to ${from} sent=${ok}`);
        }
      }
    } catch (err) {
      console.error(`[WA] message handler error:`, err);
    }
  });

  return instance;
}

export function getWAInstance(senderId: string): WAInstance | undefined {
  return instances.get(senderId);
}

export function getAllWAInstances(): WAInstance[] {
  return Array.from(instances.values());
}

/**
 * Ensure a sender's socket is live in memory. After a server restart the DB may
 * still say "connected" while the in-memory socket is gone; if the on-disk
 * session is still valid we transparently re-init and wait for it to open.
 * Returns true when the instance is connected and ready to send.
 */
export async function ensureConnected(
  senderId: string,
  phoneNumber: string,
  timeoutMs = 15_000
): Promise<boolean> {
  const existing = instances.get(senderId);
  if (existing?.status === "connected") return true;

  // Only re-init if a persisted session exists (creds present on disk).
  const credsPath = path.join(sessionDir(senderId), "creds.json");
  if (!existsSync(credsPath)) return false;

  if (!existing) {
    await initWAClient(senderId, phoneNumber, false).catch(() => {});
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inst = instances.get(senderId);
    if (inst?.status === "connected") return true;
    if (inst?.status === "disconnected") return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  return instances.get(senderId)?.status === "connected";
}

export async function sendMessage(
  senderId: string,
  phoneNumber: string,
  message: string
): Promise<boolean> {
  const instance = instances.get(senderId);
  if (!instance?.socket || instance.status !== "connected") return false;

  const clean = phoneNumber.replace(/\D/g, "");
  const jid = phoneNumber.includes("@") ? phoneNumber : `${clean}@s.whatsapp.net`;

  try {
    // Verify the destination is actually on WhatsApp before sending. This also
    // acts as a live liveness probe: on a half-open socket this query times out
    // (bounded by defaultQueryTimeoutMs) and we correctly report failure instead
    // of optimistically claiming success for a message that never left.
    if (!phoneNumber.includes("@")) {
      const results = await instance.socket.onWhatsApp(clean);
      const hit = results?.find((r) => r.exists);
      if (!hit) {
        console.error(`[WA] recipient not on WhatsApp: ${clean}`);
        return false;
      }
    }

    await instance.socket.sendMessage(jid, { text: message });
    return true;
  } catch (err) {
    console.error(`[WA] send error (${phoneNumber}):`, err);
    return false;
  }
}

export async function disconnectWAClient(senderId: string, wipeSession = false) {
  const instance = instances.get(senderId);
  if (instance?.socket) {
    try {
      instance.socket.ev.removeAllListeners("connection.update");
      instance.socket.end(undefined);
    } catch {
      /* ignore */
    }
  }
  instances.delete(senderId);
  if (wipeSession) {
    await rm(sessionDir(senderId), { recursive: true, force: true }).catch(() => {});
  }
}
