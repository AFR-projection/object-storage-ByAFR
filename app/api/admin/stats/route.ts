import { NextRequest } from "next/server";
import { eq, desc, count, sum, and, isNull, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, files, folders, activityLogs, shares, sessions } from "@/lib/db/schema";
import { requireMaster } from "@/lib/auth/session";
import { apiSuccess, handleApiError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    await requireMaster();

    // User stats
    const [userCount] = await db.select({ total: count() }).from(users);
    const [activeUsers] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.status, "active"));
    const [suspendedUsers] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.status, "suspended"));

    // File stats
    const [fileCount] = await db
      .select({ total: count() })
      .from(files)
      .where(isNull(files.deletedAt));
    const [noteCount] = await db
      .select({ total: count() })
      .from(files)
      .where(and(isNull(files.deletedAt), eq(files.isNote, true)));

    // Storage stats
    const [totalStorage] = await db
      .select({ total: sum(files.sizeBytes) })
      .from(files)
      .where(isNull(files.deletedAt));
    const [totalQuota] = await db
      .select({ total: sum(users.quotaBytes) })
      .from(users);

    // Folder stats
    const [folderCount] = await db
      .select({ total: count() })
      .from(folders)
      .where(isNull(folders.deletedAt));

    // Share stats
    const [shareCount] = await db.select({ total: count() }).from(shares);

    // Activity stats (7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [loginCount] = await db
      .select({ count: count() })
      .from(activityLogs)
      .where(and(eq(activityLogs.action, "login"), gte(activityLogs.createdAt, sevenDaysAgo)));
    const [uploadCount] = await db
      .select({ count: count() })
      .from(activityLogs)
      .where(and(eq(activityLogs.action, "upload"), gte(activityLogs.createdAt, sevenDaysAgo)));
    const [downloadCount] = await db
      .select({ count: count() })
      .from(activityLogs)
      .where(and(eq(activityLogs.action, "download"), gte(activityLogs.createdAt, sevenDaysAgo)));

    // Active sessions
    const [activeSessions] = await db
      .select({ total: count() })
      .from(sessions)
      .where(gte(sessions.expiresAt, new Date()));

    // Top users by storage
    const topUsers = await db
      .select({
        id: users.id,
        username: users.username,
        usedBytes: users.usedBytes,
        quotaBytes: users.quotaBytes,
        fileCount: count(files.id),
      })
      .from(users)
      .leftJoin(files, and(eq(users.id, files.userId), isNull(files.deletedAt)))
      .groupBy(users.id, users.username, users.usedBytes, users.quotaBytes)
      .orderBy(desc(users.usedBytes))
      .limit(5);

    // Recent activity
    const recentActivity = await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt))
      .limit(10);

    // Activity by type (7 days)
    const activityByType = await db
      .select({
        action: activityLogs.action,
        count: count(),
      })
      .from(activityLogs)
      .where(gte(activityLogs.createdAt, sevenDaysAgo))
      .groupBy(activityLogs.action)
      .orderBy(desc(count()));

    return apiSuccess({
      users: {
        total: userCount.total,
        active: activeUsers.total,
        suspended: suspendedUsers.total,
      },
      files: {
        total: fileCount.total,
        notes: noteCount.total,
      },
      storage: {
        used: totalStorage.total ?? 0,
        quota: totalQuota.total ?? 0,
      },
      folders: folderCount.total,
      shares: shareCount.total,
      activity: {
        logins: loginCount.count,
        uploads: uploadCount.count,
        downloads: downloadCount.count,
        byType: activityByType,
      },
      sessions: activeSessions.total,
      topUsers,
      recentActivity,
    });
  } catch (error) {
    return handleApiError(error);
  }
}