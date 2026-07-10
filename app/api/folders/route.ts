import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, isNotNull, desc, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db, recalculateUsedBytes } from "@/lib/db";
import { folders, files } from "@/lib/db/schema";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getEffectiveUserId, canAccessUserResource } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/auth/audit";
import { validateCsrf, SECURITY_HEADERS } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { escapeRegex } from "@/lib/utils";
import { cacheDelPattern } from "@/lib/cache/redis";

async function buildPath(parentId: string | null, name: string, userId: string) {
  if (!parentId) {
    return { materializedPath: `/${name}/`, depth: 0 };
  }
  const [parent] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, parentId), eq(folders.userId, userId), isNull(folders.deletedAt)))
    .limit(1);

  if (!parent) throw new Error("Parent folder not found");
  return {
    materializedPath: `${parent.materializedPath}${name}/`,
    depth: parent.depth + 1,
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const parentId = request.nextUrl.searchParams.get("parentId");
    const trash = request.nextUrl.searchParams.get("trash") === "true";

    const conditions = [eq(folders.userId, userId)];

    if (trash) {
      conditions.push(isNotNull(folders.deletedAt));
    } else {
      conditions.push(isNull(folders.deletedAt));
    }

    if (parentId) {
      conditions.push(eq(folders.parentId, parentId));
    } else if (!trash) {
      conditions.push(isNull(folders.parentId));
    }

    const result = await db
      .select()
      .from(folders)
      .where(and(...conditions))
      .orderBy(desc(folders.createdAt));

    return NextResponse.json(
      { success: true, data: { folders: result } },
      {
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "private, max-age=10, s-maxage=10",
        },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = createSchema.parse(await request.json());
    const ip = getClientIp(request);

    cacheDelPattern(`search:${userId}:*`).catch(() => {});

    const { materializedPath, depth } = await buildPath(body.parentId ?? null, body.name, userId);

    const [folder] = await db
      .insert(folders)
      .values({
        userId,
        parentId: body.parentId ?? null,
        name: body.name,
        materializedPath,
        depth,
      })
      .returning();

    await logActivity(sessionUser, "create_folder", {
      resourceType: "folder",
      resourceId: folder.id,
      ip,
    });

    return apiSuccess({ folder });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["rename", "move", "restore", "delete"]),
  name: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = patchSchema.parse(await request.json());
    const ip = getClientIp(request);

    const [folder] = await db.select().from(folders).where(eq(folders.id, body.id)).limit(1);
    if (!folder || !canAccessUserResource(sessionUser, folder.userId)) {
      return apiError("Folder not found", 404);
    }

    cacheDelPattern(`search:${userId}:*`).catch(() => {});

    const oldPath = folder.materializedPath;

    switch (body.action) {
      case "rename": {
        if (!body.name) return apiError("Name required", 400);
        const parentPrefix = folder.materializedPath.slice(0, -folder.name.length);
        const newPath = parentPrefix + body.name + "/";
        await db
          .update(folders)
          .set({ name: body.name, materializedPath: newPath, updatedAt: new Date() })
          .where(eq(folders.id, body.id));
        // Bulk update all children — single SQL query
        const oldLen = oldPath.length;
        await db.execute(
          sql`
            UPDATE ${folders}
            SET materialized_path = CONCAT(${newPath}, SUBSTRING(materialized_path, ${oldLen + 1})),
                updated_at = NOW()
            WHERE user_id = ${userId}
              AND materialized_path ILIKE ${escapeRegex(oldPath) + '%'}
              AND id != ${body.id}
          `
        );
        await logActivity(sessionUser, "rename", { resourceType: "folder", resourceId: body.id, ip });
        break;
      }
      case "move": {
        const { materializedPath: newPath, depth } = await buildPath(
          body.parentId ?? null,
          folder.name,
          userId
        );
        await db
          .update(folders)
          .set({ parentId: body.parentId ?? null, materializedPath: newPath, depth, updatedAt: new Date() })
          .where(eq(folders.id, body.id));
        // Bulk update all children — single SQL query
        const oldLen = oldPath.length;
        const depthDiff = depth - folder.depth;
        await db.execute(
          sql`
            UPDATE ${folders}
            SET materialized_path = CONCAT(${newPath}, SUBSTRING(materialized_path, ${oldLen + 1})),
                depth = depth + ${depthDiff},
                updated_at = NOW()
            WHERE user_id = ${userId}
              AND materialized_path ILIKE ${escapeRegex(oldPath) + '%'}
              AND id != ${body.id}
          `
        );
        await logActivity(sessionUser, "move", { resourceType: "folder", resourceId: body.id, ip });
        break;
      }
      case "delete": {
        const now = new Date();
        // Bulk soft-delete all sub-folders and their files — single queries
        await db.update(folders).set({ deletedAt: now }).where(eq(folders.id, body.id));
        await db.execute(
          sql`
            UPDATE ${files}
            SET deleted_at = NOW()
            WHERE folder_id IN (
              SELECT id FROM ${folders}
              WHERE user_id = ${userId}
                AND materialized_path ILIKE ${escapeRegex(folder.materializedPath) + '%'}
            )
          `
        );
        await recalculateUsedBytes(folder.userId);
        await logActivity(sessionUser, "delete_folder", { resourceType: "folder", resourceId: body.id, ip });
        break;
      }
      case "restore": {
        await db.update(folders).set({ deletedAt: null }).where(eq(folders.id, body.id));
        await logActivity(sessionUser, "restore", { resourceType: "folder", resourceId: body.id, ip });
        break;
      }
    }

    return apiSuccess({ id: body.id });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const { id, permanent } = z
      .object({ id: z.string().uuid(), permanent: z.boolean().default(false) })
      .parse(await request.json());
    const ip = getClientIp(request);

    const [folder] = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    if (!folder || !canAccessUserResource(sessionUser, folder.userId)) {
      return apiError("Folder not found", 404);
    }

    const subPathPattern = `${escapeRegex(folder.materializedPath)}%`;

    if (permanent) {
      await db.execute(
        sql`
          DELETE FROM ${files}
          WHERE folder_id IN (
            SELECT id FROM ${folders}
            WHERE user_id = ${folder.userId}
              AND materialized_path ILIKE ${subPathPattern}
          )
        `
      );
      await db.execute(
        sql`
          DELETE FROM ${folders}
          WHERE user_id = ${folder.userId}
            AND materialized_path ILIKE ${subPathPattern}
        `
      );
    } else {
      const now = new Date();
      await db.execute(
        sql`
          UPDATE ${files}
          SET deleted_at = NOW()
          WHERE folder_id IN (
            SELECT id FROM ${folders}
            WHERE user_id = ${folder.userId}
              AND materialized_path ILIKE ${subPathPattern}
          )
        `
      );
      await db.execute(
        sql`
          UPDATE ${folders}
          SET deleted_at = NOW()
          WHERE user_id = ${folder.userId}
            AND materialized_path ILIKE ${subPathPattern}
        `
      );
      await recalculateUsedBytes(folder.userId);
    }

    await logActivity(sessionUser, "delete_folder", {
      resourceType: "folder",
      resourceId: id,
      metadata: { permanent },
      ip,
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
