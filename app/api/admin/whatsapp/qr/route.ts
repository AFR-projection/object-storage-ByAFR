import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { requireMasterOrApiKey } from "@/lib/auth/api-key";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    const senderId = request.nextUrl.searchParams.get("id");
    if (!senderId) return apiError("Sender ID required", 400);

    const [sender] = await db
      .select()
      .from(whatsappSenders)
      .where(eq(whatsappSenders.id, senderId));

    if (!sender) return apiError("Sender not found", 404);

    const data = (sender.sessionData as { qrDataUrl?: string; pairingCode?: string } | null) || {};
    return apiSuccess({
      qrCode: data.qrDataUrl ?? null,
      pairingCode: data.pairingCode ?? null,
      status: sender.status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
