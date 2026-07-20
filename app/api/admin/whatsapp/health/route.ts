import { NextRequest } from "next/server";
import { requireMasterOrApiKey } from "@/lib/auth/api-key";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { getWaHealth } from "@/lib/whatsapp/whatsapp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp diagnostics for admins — surfaces exactly why sending may be failing
 * on a VPS (sessions dir not persisted/writable, version lookup falling back,
 * no connected sender) without needing shell access.
 */
export async function GET(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "whatsapp");
    const health = await getWaHealth();

    const problems: string[] = [];
    if (!health.sessionsDirWritable) {
      problems.push(
        "Sessions directory is not writable — Baileys can't persist auth. Check the wa_sessions volume mount and permissions."
      );
    }
    if (health.connected === 0) {
      problems.push(
        "No sender is connected. Reconnect one via QR or pairing in Admin → WhatsApp."
      );
    }
    if (health.waVersionSource === "fallback") {
      problems.push(
        "WhatsApp Web version lookup failed (using pinned fallback). Outbound network may be restricted on the VPS — set WA_VERSION if pairing fails."
      );
    }

    return apiSuccess({
      ...health,
      healthy: problems.length === 0 && health.connected > 0,
      problems,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
