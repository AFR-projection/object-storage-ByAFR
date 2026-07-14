import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { shares, files, activityLogs } from "@/lib/db/schema";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { getClientIpFromRequest, parseUserAgent, getIpLocation } from "@/lib/access-tracking";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const [share] = await db.select().from(shares).where(eq(shares.token, token)).limit(1);
    if (!share) return apiError("Share not found", 404);

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, share.fileId), isNull(files.deletedAt)))
      .limit(1);

    if (!file) return apiError("File not found", 404);

    // Duration Check
    if (share.expiresAt && share.expiresAt < new Date()) {
      return apiError("Share link expired", 410);
    }

    // Access Count Check
    if (share.maxAccessCount && share.accessCount >= share.maxAccessCount) {
      return apiError("Share link has reached maximum access limit", 403);
    }

    // Increment access count (track page view)
    const [updatedShare] = await db
      .update(shares)
      .set({
        accessCount: share.accessCount + 1,
        lastAccessedAt: new Date(),
      })
      .where(eq(shares.id, share.id))
      .returning();

    // Log detailed access info
    const ip = getClientIpFromRequest(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const deviceInfo = parseUserAgent(userAgent);

    // Fire-and-forget geolocation (non-blocking)
    getIpLocation(ip).then((location) => {
      db.insert(activityLogs).values({
        userId: share.sharedBy,
        action: "download",
        resourceType: "share",
        resourceId: share.id,
        metadata: {
          token,
          fileName: file.name,
          accessCount: updatedShare.accessCount,
          maxAccessCount: updatedShare.maxAccessCount,
          userAgent,
          device: deviceInfo.device,
          browser: deviceInfo.browser,
          os: deviceInfo.os,
          location,
        },
        ip,
      }).catch(() => {});
    });

    return apiSuccess({
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        isNote: file.isNote,
      },
      permission: share.permission,
      accessCount: updatedShare.accessCount,
      maxAccessCount: updatedShare.maxAccessCount,
      lastAccessedAt: updatedShare.lastAccessedAt,
      expiresAt: updatedShare.expiresAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
