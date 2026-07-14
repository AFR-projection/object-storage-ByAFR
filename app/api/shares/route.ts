import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { files, shares } from "@/lib/db/schema";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getAccessibleFile } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/auth/audit";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";

const createSchema = z.object({
  fileId: z.string().uuid(),
  permission: z.enum(["view", "edit"]).default("view"),
  expiresInMinutes: z.number().positive().optional(),
  maxAccessCount: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const body = createSchema.parse(await request.json());
    const ip = getClientIp(request);

    const accessible = await getAccessibleFile(sessionUser, body.fileId);
    if (!accessible?.canView) {
      return apiError("File not found", 404);
    }
    const file = accessible.file;

    const token = nanoid(32);
    const expiresAt = body.expiresInMinutes
      ? new Date(Date.now() + body.expiresInMinutes * 60000)
      : null;

    const [share] = await db
      .insert(shares)
      .values({
        fileId: body.fileId,
        sharedBy: sessionUser.effectiveUserId,
        token,
        permission: body.permission,
        expiresAt,
        maxAccessCount: body.maxAccessCount,
      })
      .returning();

    await logActivity(sessionUser, "share", {
      resourceType: "file",
      resourceId: body.fileId,
      metadata: { token },
      ip,
    });

    dispatchWebhookEvent(file.userId, "share", {
      fileId: body.fileId,
      name: file.name,
      shareId: share.id,
      permission: body.permission,
    }).catch(() => {});

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/shared/${token}`;
    return apiSuccess({ share, shareUrl });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    const userId = sessionUser.effectiveUserId;

    const result = await db
      .select({ share: shares, file: files })
      .from(shares)
      .innerJoin(files, eq(shares.fileId, files.id))
      .where(eq(shares.sharedBy, userId))
      .orderBy(desc(shares.createdAt));

    return apiSuccess({ shares: result });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteShareSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const { id } = deleteShareSchema.parse(await request.json());

    const [share] = await db.select().from(shares).where(eq(shares.id, id)).limit(1);
    if (!share) return apiError("Share not found", 404);
    if (share.sharedBy !== sessionUser.effectiveUserId && sessionUser.role !== "master") {
      return apiError("Forbidden", 403);
    }

    await db.delete(shares).where(eq(shares.id, id));
    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
