import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

const schema = z.object({
  paths: z.array(z.string().min(1).max(1024)).min(1).max(200),
  rootFolderId: z.string().uuid().nullable().optional(),
});

async function getOrCreateFolder(
  userId: string,
  pathParts: string[],
  cache: Map<string, string>,
  rootFolderId: string | null = null,
): Promise<string | null> {
  let parentId: string | null = rootFolderId;

  for (let i = 0; i < pathParts.length; i++) {
    const name: string = pathParts[i];
    const cacheKey: string = `${parentId ?? "root"}:${name}`;

    if (cache.has(cacheKey)) {
      parentId = cache.get(cacheKey)!;
      continue;
    }

    const conditions = [
      eq(folders.userId, userId),
      eq(folders.name, name),
      isNull(folders.deletedAt),
    ];
    if (parentId) {
      conditions.push(eq(folders.parentId, parentId));
    } else {
      conditions.push(isNull(folders.parentId));
    }

    const [existing] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(...conditions))
      .limit(1);

    if (existing) {
      parentId = existing.id;
      cache.set(cacheKey, parentId);
      continue;
    }

    const materializedPath = `/${pathParts.slice(0, i + 1).join("/")}/`;
    const depth = i;

    const [created]: { id: string }[] = await db
      .insert(folders)
      .values({
        userId,
        parentId: parentId ?? null,
        name,
        materializedPath,
        depth,
      })
      .returning({ id: folders.id });

    parentId = created.id;
    cache.set(cacheKey, created.id);
  }

  return parentId;
}

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) {
      return apiError("Invalid CSRF token", 403);
    }

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { paths, rootFolderId } = schema.parse(await request.json());

    const uniquePaths = [...new Set(paths.map((p: string) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")))];

    const cache = new Map<string, string>();
    const result: Record<string, string> = {};

    for (const path of uniquePaths) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 0) continue;
      const folderId = await getOrCreateFolder(userId, parts, cache, rootFolderId ?? null);
      if (folderId) {
        result[path] = folderId;
      }
    }

    return apiSuccess({ folders: result });
  } catch (error) {
    return handleApiError(error);
  }
}
