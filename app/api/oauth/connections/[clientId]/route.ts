import { NextRequest } from "next/server";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { revokeConnectedApp } from "@/lib/oauth/tokens";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);
    const user = await requireAuth();
    const { clientId } = await params;
    void getClientIp(request);

    const revoked = await revokeConnectedApp(user.id, clientId);
    if (revoked === 0) {
      return apiError("No active connection found for this app", 404);
    }

    return apiSuccess({ revoked });
  } catch (error) {
    return handleApiError(error);
  }
}
