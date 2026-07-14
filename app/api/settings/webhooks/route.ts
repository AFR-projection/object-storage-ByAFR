import { NextRequest } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { webhooks } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

const WEBHOOK_EVENTS = ["upload", "delete", "share"] as const;

export async function GET() {
  try {
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);

    const hooks = await db
      .select({
        id: webhooks.id,
        url: webhooks.url,
        events: webhooks.events,
        enabled: webhooks.enabled,
        lastDeliveryAt: webhooks.lastDeliveryAt,
        lastStatus: webhooks.lastStatus,
        createdAt: webhooks.createdAt,
      })
      .from(webhooks)
      .where(eq(webhooks.userId, userId))
      .orderBy(desc(webhooks.createdAt));

    return apiSuccess({ webhooks: hooks });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).default(["upload", "delete", "share"]),
  secret: z.string().min(8).max(128).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = createSchema.parse(await request.json());

    const secret = body.secret ?? nanoid(32);

    const [hook] = await db
      .insert(webhooks)
      .values({
        userId,
        url: body.url,
        secret,
        events: body.events,
      })
      .returning({
        id: webhooks.id,
        url: webhooks.url,
        events: webhooks.events,
        enabled: webhooks.enabled,
        createdAt: webhooks.createdAt,
      });

    return apiSuccess({ webhook: { ...hook, secret } });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = patchSchema.parse(await request.json());

    const [existing] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, body.id), eq(webhooks.userId, userId)))
      .limit(1);

    if (!existing) return apiError("Webhook not found", 404);

    const [updated] = await db
      .update(webhooks)
      .set({
        url: body.url ?? existing.url,
        events: body.events ?? existing.events,
        enabled: body.enabled ?? existing.enabled,
      })
      .where(eq(webhooks.id, body.id))
      .returning({
        id: webhooks.id,
        url: webhooks.url,
        events: webhooks.events,
        enabled: webhooks.enabled,
        lastDeliveryAt: webhooks.lastDeliveryAt,
        lastStatus: webhooks.lastStatus,
        createdAt: webhooks.createdAt,
      });

    return apiSuccess({ webhook: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { id } = deleteSchema.parse(await request.json());

    const deleted = await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
      .returning({ id: webhooks.id });

    if (deleted.length === 0) return apiError("Webhook not found", 404);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
