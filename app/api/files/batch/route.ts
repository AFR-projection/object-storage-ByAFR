import { NextRequest } from "next/server";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { files, folders } from "@/lib/db/schema";
import { getClientIp, requireAuth } from "@/lib/auth/session";
import { requireAuthOrApiKey } from "@/lib/auth/api-key";
import { getEffectiveUserId, canAccessUserResource } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/auth/audit";
import { deleteR2Objects } from "@/lib/storage/r2";
import { validateCsrf } from "@/lib/security";
import { cacheDelPattern } from "@/lib/cache/redis";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { recalculateUsedBytes } from "@/lib/db";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["delete", "restore", "favorite", "move"]),
  // Destination folder for action="move" (null/omitted = move to root).
  folderId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = patchSchema.parse(await request.json());
    const ip = getClientIp(request);

    const rows = await db.select().from(files).where(inArray(files.id, body.ids));
    if (rows.length === 0) return apiError("No files found", 404);

    for (const row of rows) {
      if (!canAccessUserResource(sessionUser, row.userId)) {
        return apiError("File not found", 404);
      }
    }

    // Only operate on owned/allowed ids that were returned
    const ids = rows.map((r) => r.id);
    const ownerIds = [...new Set(rows.map((r) => r.userId))];

    for (const ownerId of ownerIds) {
      cacheDelPattern(`search:${ownerId}:*`).catch(() => {});
      cacheDelPattern(`files:${ownerId}:*`).catch(() => {});
    }

    const now = new Date();

    switch (body.action) {
      case "delete": {
        await db
          .update(files)
          .set({ deletedAt: now, updatedAt: now })
          .where(inArray(files.id, ids));
        for (const ownerId of ownerIds) {
          await recalculateUsedBytes(ownerId);
        }
        break;
      }
      case "restore": {
        await db
          .update(files)
          .set({ deletedAt: null, updatedAt: now })
          .where(inArray(files.id, ids));
        for (const ownerId of ownerIds) {
          await recalculateUsedBytes(ownerId);
        }
        break;
      }
      case "favorite": {
        // Toggle individually would be N queries; set all to favorite=true when any false, else unfavorite all
        const allFavorite = rows.every((r) => r.isFavorite);
        await db
          .update(files)
          .set({ isFavorite: !allFavorite, updatedAt: now })
          .where(inArray(files.id, ids));
        break;
      }
      case "move": {
        // Validate the destination folder belongs to the same owner (root = null is always ok).
        if (body.folderId) {
          const [dest] = await db
            .select({ userId: folders.userId })
            .from(folders)
            .where(eq(folders.id, body.folderId))
            .limit(1);
          if (!dest || !ownerIds.every((o) => o === dest.userId)) {
            return apiError("Destination folder not found", 404);
          }
        }
        await db
          .update(files)
          .set({ folderId: body.folderId ?? null, updatedAt: now })
          .where(inArray(files.id, ids));
        break;
      }
    }

    await logActivity(sessionUser, body.action === "favorite" ? "favorite" : body.action, {
      resourceType: "file",
      resourceId: ids[0],
      metadata: { batch: true, count: ids.length, action: body.action },
      ip,
    });

    void userId;

    return apiSuccess({ ids, count: ids.length, action: body.action });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  permanent: z.literal(true),
});

export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuthOrApiKey(request, ["delete"]);
    const body = deleteSchema.parse(await request.json());
    const ip = getClientIp(request);

    const rows = await db
      .select()
      .from(files)
      .where(and(inArray(files.id, body.ids), isNotNull(files.deletedAt)));

    if (rows.length === 0) return apiError("No trashed files found", 404);

    for (const row of rows) {
      if (!canAccessUserResource(sessionUser, row.userId)) {
        return apiError("File not found", 404);
      }
    }

    const ids = rows.map((r) => r.id);
    const ownerIds = [...new Set(rows.map((r) => r.userId))];
    const keys: string[] = [];
    for (const row of rows) {
      keys.push(row.r2Key);
      if (row.thumbnailKey) keys.push(row.thumbnailKey);
    }

    await deleteR2Objects(keys);
    await db.delete(files).where(inArray(files.id, ids));

    for (const ownerId of ownerIds) {
      cacheDelPattern(`search:${ownerId}:*`).catch(() => {});
      cacheDelPattern(`files:${ownerId}:*`).catch(() => {});
      await recalculateUsedBytes(ownerId);
    }

    await logActivity(sessionUser, "delete", {
      resourceType: "file",
      resourceId: ids[0],
      metadata: { batch: true, permanent: true, count: ids.length },
      ip,
    });

    for (const row of rows) {
      void dispatchWebhookEvent(row.userId, "delete", {
        fileId: row.id,
        name: row.name,
        permanent: true,
      });
    }

    return apiSuccess({ deleted: true, count: ids.length });
  } catch (error) {
    return handleApiError(error);
  }
}
