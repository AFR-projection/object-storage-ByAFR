import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { bootstrapWhatsAppClients } from "@/lib/whatsapp/whatsapp-bootstrap";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    if (sessionUser.role !== "master") return apiError("Forbidden", 403);

    await bootstrapWhatsAppClients();
    return apiSuccess({ initialized: true, message: "WhatsApp clients initialized" });
  } catch (error) {
    return handleApiError(error);
  }
}
