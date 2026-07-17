import { NextRequest } from "next/server";
import { desc, eq, and, gte, count, isNull, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activityLogs, users, files, activityActionEnum } from "@/lib/db/schema";
import { requireMaster } from "@/lib/auth/session";
import { apiSuccess, handleApiError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    await requireMaster();

    const [userCount] = await db.select({ total: count() }).from(users);
    const [fileCount] = await db
      .select({ total: count() })
      .from(files)
      .where(isNull(files.deletedAt));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [loginResult] = await db
      .select({ count: count() })
      .from(activityLogs)
      .where(and(eq(activityLogs.action, "login"), gte(activityLogs.createdAt, sevenDaysAgo)));

    const [uploadResult] = await db
      .select({ count: count() })
      .from(activityLogs)
      .where(and(eq(activityLogs.action, "upload"), gte(activityLogs.createdAt, sevenDaysAgo)));

    const [downloadResult] = await db
      .select({ count: count() })
      .from(activityLogs)
      .where(and(eq(activityLogs.action, "download"), gte(activityLogs.createdAt, sevenDaysAgo)));

    return apiSuccess({
      totalUsers: userCount.total,
      totalFiles: fileCount.total,
      loginActivity: loginResult.count,
      uploadActivity: uploadResult.count,
      downloadActivity: downloadResult.count,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const logsSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function POST(request: NextRequest) {
  try {
    await requireMaster();
    const params = logsSchema.parse(await request.json());

    const conditions = [];
    if (params.userId) conditions.push(eq(activityLogs.userId, params.userId));
    if (params.action)
      conditions.push(
        eq(activityLogs.action, params.action as (typeof activityActionEnum.enumValues)[number])
      );

    const logs = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        resourceType: activityLogs.resourceType,
        resourceId: activityLogs.resourceId,
        metadata: activityLogs.metadata,
        ip: activityLogs.ip,
        createdAt: activityLogs.createdAt,
        username: users.username,
        phone: users.phone,
        userRole: users.role,
      })
      .from(activityLogs)
      .innerJoin(users, eq(activityLogs.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(activityLogs.createdAt))
      .limit(params.limit)
      .offset(params.offset);

    // If search is provided, filter by username or metadata on the client side is not possible
    // so we do a simple contains check on the username
    let filteredLogs = logs;
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filteredLogs = logs.filter(
        (log) =>
          log.username?.toLowerCase().includes(searchLower) ||
          log.phone?.toLowerCase().includes(searchLower) ||
          log.action.toLowerCase().includes(searchLower) ||
          log.ip?.toLowerCase().includes(searchLower) ||
          JSON.stringify(log.metadata).toLowerCase().includes(searchLower)
      );
    }

    return apiSuccess({ logs: filteredLogs });
  } catch (error) {
    return handleApiError(error);
  }
}