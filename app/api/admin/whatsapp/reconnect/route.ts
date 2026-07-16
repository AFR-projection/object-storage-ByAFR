import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { eq } from "drizzle-orm";
import { disconnectWAClient, initWAClient } from "@/lib/whatsapp/whatsapp-client";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    if (sessionUser.role !== "master") return apiError("Forbidden", 403);

    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());

    const [sender] = await db
      .select()
      .from(whatsappSenders)
      .where(eq(whatsappSenders.id, id));

    if (!sender) return apiError("Sender not found", 404);

    disconnectWAClient(id);
    await initWAClient(id, sender.phoneNumber);

    return apiSuccess({ reconnecting: true });
  } catch (error) {
    return handleApiError(error);
  }
}
