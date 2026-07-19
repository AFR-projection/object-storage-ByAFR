import { NextRequest } from "next/server";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { listConnectedApps } from "@/lib/oauth/tokens";
import { apiSuccess, handleApiError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    void getClientIp(request);
    const apps = await listConnectedApps(user.id);
    return apiSuccess({ apps });
  } catch (error) {
    return handleApiError(error);
  }
}
