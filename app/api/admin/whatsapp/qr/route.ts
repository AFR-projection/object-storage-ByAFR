import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { whatsappSenders } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    if (sessionUser.role !== "master") return apiError("Forbidden", 403);

    const senderId = request.nextUrl.searchParams.get("id");
    if (!senderId) return apiError("Sender ID required", 400);

    const [sender] = await db
      .select()
      .from(whatsappSenders)
      .where(eq(whatsappSenders.id, senderId));

    if (!sender) return apiError("Sender not found", 404);

    const data = (sender.sessionData as any) || {};
    return apiSuccess({
      qrCode: data.qrDataUrl ?? null,
      pairingCode: data.pairingCode ?? null,
      status: sender.status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
