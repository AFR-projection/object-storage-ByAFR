import { NextRequest } from "next/server";
import { requireMasterOrApiKey } from "@/lib/auth/api-key";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { bootstrapWhatsAppClients } from "@/lib/whatsapp/whatsapp-bootstrap";

export async function POST(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    await bootstrapWhatsAppClients();
    return apiSuccess({ initialized: true, message: "WhatsApp clients initialized" });
  } catch (error) {
    return handleApiError(error);
  }
}
