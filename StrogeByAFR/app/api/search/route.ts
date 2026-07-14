import { NextRequest } from "next/server";
import { eq, and, isNull, ilike, gte, lte, desc, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import { cacheGet, cacheSet } from "@/lib/cache/redis";
import { apiSuccess, handleApiError } from "@/lib/api/response";

const searchSchema = z.object({
  q: z.string().optional(),
  mimeType: z.string().optional(),
  minSize: z.coerce.number().optional(),
  maxSize: z.coerce.number().optional(),
  folderId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const params = searchSchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const cacheKey = `search:${userId}:${JSON.stringify(params)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return apiSuccess(cached);

    const conditions = [eq(files.userId, userId), isNull(files.deletedAt)];

    if (params.q) {
      conditions.push(ilike(files.name, `%${params.q}%`));
    }
    if (params.mimeType) {
      conditions.push(ilike(files.mimeType, `${params.mimeType}%`));
    }
    if (params.minSize !== undefined) {
      conditions.push(gte(files.sizeBytes, params.minSize));
    }
    if (params.maxSize !== undefined) {
      conditions.push(lte(files.sizeBytes, params.maxSize));
    }
    if (params.folderId) {
      conditions.push(eq(files.folderId, params.folderId));
    }
    if (params.from) {
      conditions.push(gte(files.createdAt, new Date(params.from)));
    }
    if (params.to) {
      conditions.push(lte(files.createdAt, new Date(params.to)));
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

    const data = { files: items, nextCursor, total: items.length };
    await cacheSet(cacheKey, data, 30);
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}
