import { NextRequest } from "next/server";
import { eq, and, isNull, isNotNull, desc, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { files, folders } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { getEffectiveUserId, canAccessUserResource } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/auth/session";
import {
  buildR2Key,
  copyR2Object,
  deleteR2Object,
  getPresignedDownloadUrl,
} from "@/lib/storage/r2";
import { validateCsrf } from "@/lib/security";
import { cacheGet, cacheSet, cacheDelPattern, cacheDel } from "@/lib/cache/redis";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { recalculateUsedBytes } from "@/lib/db";

const listSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  trash: z.coerce.boolean().default(false),
  favorites: z.coerce.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const params = listSchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const cacheKey = `files:${userId}:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ files: unknown[]; nextCursor: string | null }>(cacheKey);
    if (cached) return apiSuccess(cached);

    const conditions = [eq(files.userId, userId)];

    if (params.trash) {
      conditions.push(isNotNull(files.deletedAt));
    } else {
      conditions.push(isNull(files.deletedAt));
    }

    if (params.favorites) {
      conditions.push(eq(files.isFavorite, true));
    }

    if (params.folderId) {
      conditions.push(eq(files.folderId, params.folderId));
    } else if (!params.trash && !params.favorites) {
      conditions.push(isNull(files.folderId));
    }

    if (params.cursor) {
      conditions.push(lt(files.createdAt, new Date(params.cursor)));
    }

    const result = await db
      .select()
      .from(files)
      .where(and(...conditions))
      .orderBy(desc(files.createdAt))
      .limit(params.limit + 1);

    const hasMore = result.length > params.limit;
    const items = hasMore ? result.slice(0, params.limit) : result;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    const data = { files: items, nextCursor };
    await cacheSet(cacheKey, data, 15);
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}

const createNoteSchema = z.object({
  name: z.string().min(1).max(255).default("Untitled Note"),
  folderId: z.string().uuid().nullable().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = createNoteSchema.parse(await request.json());
    const ip = getClientIp(request);

    const [file] = await db
      .insert(files)
      .values({
        userId,
        folderId: body.folderId ?? null,
        name: body.name.endsWith(".note") ? body.name : `${body.name}.note`,
        mimeType: "application/json",
        sizeBytes: 0,
        r2Key: `notes/${userId}/${crypto.randomUUID()}`,
        isNote: true,
      })
      .returning();

    if (body.content) {
      const { fileContents } = await import("@/lib/db/schema");
      await db.insert(fileContents).values({
        fileId: file.id,
        contentJson: body.content,
      });
    }

    await logActivity(sessionUser, "upload", {
      resourceType: "file",
      resourceId: file.id,
      metadata: { name: file.name, type: "note" },
      ip,
    });

    return apiSuccess({ file });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["rename", "move", "favorite", "restore", "delete", "duplicate", "copy"]),
  name: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  targetFolderId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = patchSchema.parse(await request.json());
    const ip = getClientIp(request);

    const [file] = await db.select().from(files).where(eq(files.id, body.id)).limit(1);
    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    cacheDelPattern(`search:${file.userId}:*`).catch(() => {});
    cacheDelPattern(`files:${file.userId}:*`).catch(() => {});

    switch (body.action) {
      case "rename": {
        if (!body.name) return apiError("Name required", 400);
        await db.update(files).set({ name: body.name, updatedAt: new Date() }).where(eq(files.id, body.id));
        await logActivity(sessionUser, "rename", { resourceType: "file", resourceId: body.id, ip });
        break;
      }
      case "move": {
        await db
          .update(files)
          .set({ folderId: body.folderId ?? null, updatedAt: new Date() })
          .where(eq(files.id, body.id));
        await logActivity(sessionUser, "move", { resourceType: "file", resourceId: body.id, ip });
        break;
      }
      case "favorite": {
        await db
          .update(files)
          .set({ isFavorite: !file.isFavorite, updatedAt: new Date() })
          .where(eq(files.id, body.id));
        await logActivity(sessionUser, "favorite", { resourceType: "file", resourceId: body.id, ip });
        break;
      }
      case "delete": {
        await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, body.id));
        await recalculateUsedBytes(file.userId);
        await logActivity(sessionUser, "delete", { resourceType: "file", resourceId: body.id, ip });
        break;
      }
      case "restore": {
        await db.update(files).set({ deletedAt: null }).where(eq(files.id, body.id));
        await recalculateUsedBytes(file.userId);
        await logActivity(sessionUser, "restore", { resourceType: "file", resourceId: body.id, ip });
        break;
      }
      case "duplicate":
      case "copy": {
        const destFolderId = body.targetFolderId ?? file.folderId;
        const copyName = body.action === "duplicate" ? `Copy of ${file.name}` : file.name;
        const [newFile] = await db
          .insert(files)
          .values({
            userId: file.userId,
            folderId: destFolderId,
            name: copyName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            r2Key: "pending",
            checksumSha256: file.checksumSha256,
            isNote: file.isNote,
          })
          .returning();

        const newKey = buildR2Key(userId, newFile.id, copyName);
        await copyR2Object(file.r2Key, newKey);
        await db.update(files).set({ r2Key: newKey }).where(eq(files.id, newFile.id));
        await logActivity(sessionUser, "copy", {
          resourceType: "file",
          resourceId: newFile.id,
          metadata: { sourceId: body.id },
          ip,
        });
        return apiSuccess({ file: newFile });
      }
    }

    return apiSuccess({ id: body.id });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  id: z.string().uuid(),
  permanent: z.boolean().default(false),
});

export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const body = deleteSchema.parse(await request.json());
    const ip = getClientIp(request);

    const [file] = await db.select().from(files).where(eq(files.id, body.id)).limit(1);
    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    cacheDelPattern(`search:${file.userId}:*`).catch(() => {});
    cacheDelPattern(`files:${file.userId}:*`).catch(() => {});

    if (body.permanent) {
      if (!file.deletedAt) {
        return apiError("File must be in recycle bin first", 400);
      }
      await deleteR2Object(file.r2Key);
      if (file.thumbnailKey) await deleteR2Object(file.thumbnailKey);
      await db.delete(files).where(eq(files.id, body.id));
    } else {
      await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, body.id));
    }

    await recalculateUsedBytes(file.userId);

    await logActivity(sessionUser, "delete", {
      resourceType: "file",
      resourceId: body.id,
      metadata: { permanent: body.permanent },
      ip,
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
