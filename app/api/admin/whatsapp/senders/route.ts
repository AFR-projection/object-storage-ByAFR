import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { requireMasterOrApiKey } from "@/lib/auth/api-key";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { z } from "zod";
import { initWAClient, disconnectWAClient } from "@/lib/whatsapp/whatsapp-client";

const createSenderSchema = z.object({
  phoneNumber: z.string().min(8).max(20),
  displayName: z.string().min(1).max(100),
  method: z.enum(["qr", "pairing"]).default("qr"),
});

const updateSenderSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    const senders = await db.select().from(whatsappSenders);
    return apiSuccess(senders);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    const body = createSenderSchema.parse(await request.json());
    const cleanPhone = body.phoneNumber.replace(/\D/g, "");

    // Pairing mode needs a valid phone number with country code.
    if (body.method === "pairing" && cleanPhone.length < 10) {
      return apiError("Invalid WhatsApp number for pairing (min 10 digits with country code)", 400);
    }

    const [sender] = await db
      .insert(whatsappSenders)
      .values({ phoneNumber: cleanPhone, displayName: body.displayName })
      .returning();

    // Kick off connection (async — QR/pairing code lands via polling).
    initWAClient(sender.id, cleanPhone, body.method === "pairing").catch((e) =>
      console.error(`[WA] init failed for ${sender.id}:`, e)
    );

    return apiSuccess({ ...sender, method: body.method }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    const { id, ...updates } = (await request.json()) as {
      id: string;
    } & z.infer<typeof updateSenderSchema>;

    const [updated] = await db
      .update(whatsappSenders)
      .set(updates)
      .where(eq(whatsappSenders.id, id))
      .returning();

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());

    await disconnectWAClient(id, true);
    await db.delete(whatsappSenders).where(eq(whatsappSenders.id, id));
    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
