import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { z } from "zod";
import { initWAClient, getWAInstance, disconnectWAClient } from "@/lib/whatsapp/whatsapp-client";

const createSenderSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
  displayName: z.string().min(1).max(100),
});

const updateSenderSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    if (sessionUser.role !== "master") return apiError("Forbidden", 403);

    const senders = await db.select().from(whatsappSenders);
    return apiSuccess(senders);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    if (sessionUser.role !== "master") return apiError("Forbidden", 403);

    const body = createSenderSchema.parse(await request.json());
    const cleanPhone = body.phoneNumber.replace(/\D/g, "");

    const [sender] = await db
      .insert(whatsappSenders)
      .values({
        phoneNumber: cleanPhone,
        displayName: body.displayName,
      })
      .returning();

    await initWAClient(sender.id, cleanPhone);
    return apiSuccess(sender, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    if (sessionUser.role !== "master") return apiError("Forbidden", 403);

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
    const sessionUser = await requireAuth();
    if (sessionUser.role !== "master") return apiError("Forbidden", 403);

    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());

    disconnectWAClient(id);
    await db.delete(whatsappSenders).where(eq(whatsappSenders.id, id));
    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
