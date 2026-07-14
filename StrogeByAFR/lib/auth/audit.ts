import { db } from "@/lib/db";
import { activityLogs, type User } from "@/lib/db/schema";
import type { SessionUser } from "./session";

type ActivityAction = typeof activityLogs.$inferInsert["action"];

export async function logActivity(
  user: SessionUser | User,
  action: ActivityAction,
  options?: {
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ip?: string;
  }
): Promise<void> {
  await db.insert(activityLogs).values({
    userId: user.id,
    action,
    resourceType: options?.resourceType,
    resourceId: options?.resourceId,
    metadata: options?.metadata,
    ip: options?.ip,
  });
}
