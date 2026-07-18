import { NextRequest } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth/api-key";
import { buildConnectManifest } from "@/lib/mcp/connect-manifest";
import { mcpSessionStats } from "@/lib/mcp/http-sessions";
import { appPublicUrl } from "@/lib/env/runtime";
import { apiSuccess, handleApiError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    await requireAuthOrApiKey(request, []);
    const manifest = buildConnectManifest(appPublicUrl() || request.nextUrl.origin);
    const stats = mcpSessionStats();

    return apiSuccess({
      ...manifest,
      live: {
        mcpSessionsActive: stats.active,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
