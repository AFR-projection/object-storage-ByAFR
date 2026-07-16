import { Boom } from "@hapi/boom";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  isJidBroadcast,
} from "baileys";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mkdir } from "fs/promises";
import path from "path";
import QRCode from "qrcode";

export interface WAInstance {
  id: string;
  phoneNumber: string;
  socket: ReturnType<typeof makeWASocket> | null;
  status: "connecting" | "connected" | "disconnected" | "error";
}

const instances = new Map<string, WAInstance>();

export async function initWAClient(senderId: string, phoneNumber: string) {
  if (instances.has(senderId)) {
    const instance = instances.get(senderId)!;
    if (instance.status === "connected") return instance;
    if (instance.socket) instance.socket.end(new Error("Manual disconnect"));
  }

  const sessionPath = path.join(process.cwd(), "wa-sessions", senderId);
  await mkdir(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 30_000,
  });

  const instance: WAInstance = {
    id: senderId,
    phoneNumber,
    socket,
    status: "connecting",
  };

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        const sessionData = { qrCode: qrDataUrl, generatedAt: Date.now() };
        await db
          .update(whatsappSenders)
          .set({
            status: "connecting",
            sessionData: sessionData as any,
            errorMessage: null,
          })
          .where(eq(whatsappSenders.id, senderId));
        console.log(`[WA] QR generated for ${phoneNumber}`);
      } catch (err) {
        console.error(`[WA] QR generation error:`, err);
      }
    }

    if (connection === "open") {
      instance.status = "connected";
      await db
        .update(whatsappSenders)
        .set({
          status: "connected",
          lastConnectedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(whatsappSenders.id, senderId));
      console.log(`[WA] Connected: ${phoneNumber}`);
    }

    if (connection === "close") {
      instance.status = "disconnected";
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        await db
          .update(whatsappSenders)
          .set({ status: "disconnected" })
          .where(eq(whatsappSenders.id, senderId));
        setTimeout(() => initWAClient(senderId, phoneNumber), 5000);
      } else {
        await db
          .update(whatsappSenders)
          .set({ status: "disconnected", isActive: false })
          .where(eq(whatsappSenders.id, senderId));
        console.log(`[WA] Logged out: ${phoneNumber}`);
      }
    }
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const { handleIncomingMessage } = await import("./message-handler");
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe || isJidBroadcast(msg.key.remoteJid!))
          continue;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) continue;
        const from = msg.key.remoteJid!.split("@")[0];
        const reply = await handleIncomingMessage(from, text);
        if (reply) {
          await sendMessage(senderId, from, reply);
        }
      }
    } catch (err) {
      console.error(`[WA] Message handler error:`, err);
    }
  });

  instances.set(senderId, instance);
  return instance;
}

export function getWAInstance(senderId: string): WAInstance | undefined {
  return instances.get(senderId);
}

export function getAllWAInstances(): WAInstance[] {
  return Array.from(instances.values());
}

export async function sendMessage(
  senderId: string,
  phoneNumber: string,
  message: string
): Promise<boolean> {
  const instance = instances.get(senderId);
  if (!instance || !instance.socket || instance.status !== "connected") {
    return false;
  }

  try {
    const jid = phoneNumber.includes("@") ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
    await instance.socket.sendMessage(jid, { text: message });
    return true;
  } catch (err) {
    console.error(`[WA] Send message error (${phoneNumber}):`, err);
    return false;
  }
}

export async function disconnectWAClient(senderId: string) {
  const instance = instances.get(senderId);
  if (instance?.socket) {
    instance.socket.end(new Error("Admin disconnect"));
    instance.status = "disconnected";
    instances.delete(senderId);
  }
}
