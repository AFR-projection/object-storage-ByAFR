import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import {
  WEBHOOK_EVENTS,
  deleteWebhook,
  updateWebhook,
  validateWebhookUrl,
  type WebhookEventName,
} from "@/lib/webhooks/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  url: z.string().min(1).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    let url: string | undefined;
    if (body.url !== undefined) {
      const check = validateWebhookUrl(body.url);
      if (!check.ok) return apiError(check.error, 400);
      url = check.url;
    }

    const updated = await updateWebhook(userId, id, {
      url,
      events: body.events as WebhookEventName[] | undefined,
      enabled: body.enabled,
    });
    if (!updated) return apiError("Webhook not found", 404);

    return apiSuccess({ webhook: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { id } = await params;

    const ok = await deleteWebhook(userId, id);
    if (!ok) return apiError("Webhook not found", 404);

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
