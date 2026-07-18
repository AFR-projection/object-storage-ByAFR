import { NextRequest } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth/api-key";
import { buildApiV1Docs } from "@/lib/api/v1-docs";
import { apiSuccess, handleApiError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    await requireAuthOrApiKey(request, ["read"]);
    return apiSuccess(buildApiV1Docs());
  } catch (error) {
    return handleApiError(error);
  }
}
