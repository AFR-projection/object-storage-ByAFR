import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { requireMasterOrApiKey } from "@/lib/auth/api-key";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { eq } from "drizzle-orm";
import { disconnectWAClient, initWAClient } from "@/lib/whatsapp/whatsapp-client";

export async function POST(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    const { id, method } = z
      .object({
        id: z.string().uuid(),
        method: z.enum(["qr", "pairing"]).default("qr"),
      })
      .parse(await request.json());

    const [sender] = await db
      .select()
      .from(whatsappSenders)
      .where(eq(whatsappSenders.id, id));

    if (!sender) return apiError("Sender not found", 404);

    // Wipe the old (possibly stale) session and start fresh so QR/pairing regenerates.
    await disconnectWAClient(id, true);
    initWAClient(id, sender.phoneNumber, method === "pairing").catch((e) =>
      console.error(`[WA] reconnect init failed:`, e)
    );

    return apiSuccess({ reconnecting: true });
  } catch (error) {
    return handleApiError(error);
  }
}
