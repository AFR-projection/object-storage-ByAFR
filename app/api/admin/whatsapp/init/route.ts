import { NextRequest } from "next/server";
import { requireMasterOrApiKey } from "@/lib/auth/api-key";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import {
  ensureWhatsAppBootstrapped,
  resetWhatsAppBootstrapLatch,
} from "@/lib/whatsapp/whatsapp-bootstrap";

export async function POST(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");

    resetWhatsAppBootstrapLatch();
    await ensureWhatsAppBootstrapped();
    return apiSuccess({ initialized: true, message: "WhatsApp clients initialized" });
  } catch (error) {
    return handleApiError(error);
  }
}
