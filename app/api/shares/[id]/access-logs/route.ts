import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { shares, activityLogs } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;

    // Verify the share belongs to this user
    const [share] = await db.select().from(shares).where(eq(shares.id, id)).limit(1);
    if (!share) return apiError("Share not found", 404);
    if (share.sharedBy !== sessionUser.effectiveUserId && sessionUser.role !== "master") {
      return apiError("Forbidden", 403);
    }

    const logs = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.resourceId, id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(50);

    return apiSuccess({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
