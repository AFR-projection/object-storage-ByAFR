import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import {
  WEBHOOK_EVENTS,
  MAX_WEBHOOKS_PER_USER,
  countWebhooks,
  createWebhook,
  listWebhooks,
  validateWebhookUrl,
  type WebhookEventName,
} from "@/lib/webhooks/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const hooks = await listWebhooks(userId);
    return apiSuccess({ webhooks: hooks, availableEvents: WEBHOOK_EVENTS });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  url: z.string().min(1),
  events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = createSchema.parse(await request.json());

    const check = validateWebhookUrl(body.url);
    if (!check.ok) return apiError(check.error, 400);

    const existing = await countWebhooks(userId);
    if (existing >= MAX_WEBHOOKS_PER_USER) {
      return apiError(`Maximum ${MAX_WEBHOOKS_PER_USER} webhooks allowed`, 400);
    }

    const hook = await createWebhook({
      userId,
      url: check.url,
      events: (body.events ?? [...WEBHOOK_EVENTS]) as WebhookEventName[],
    });

    return apiSuccess({ webhook: hook });
  } catch (error) {
    return handleApiError(error);
  }
}
