import { NextRequest } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth/api-key";
import { buildApiV1Docs } from "@/lib/api/v1-docs";
import { buildMasterApiDocs } from "@/lib/api/master-v1-docs";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import type { SessionUser } from "@/lib/auth/session";

function isKeySession(user: SessionUser): user is import("@/lib/auth/api-key").SessionUserFromApiKey {
  return "authMethod" in user && user.authMethod === "api_key";
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAuthOrApiKey(request, []);
    const docs =
      isKeySession(sessionUser) && sessionUser.apiKeyTier === "master"
        ? buildMasterApiDocs()
        : buildApiV1Docs();
    return apiSuccess(docs);
  } catch (error) {
    return handleApiError(error);
  }
}
