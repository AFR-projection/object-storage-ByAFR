import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getEffectiveUserId, canAccessUserResource } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/auth/audit";
import { objectExists, downloadFromR2Bytes } from "@/lib/storage/r2";
import { validateCsrf } from "@/lib/security";
import { validateFileMagicBytes } from "@/lib/security/file-validation";
import { checkSuspiciousActivity, logSuspiciousActivity } from "@/lib/security/suspicious-activity";
import { enqueueJob } from "@/lib/queue";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { recalculateUsedBytes } from "@/lib/db";

const schema = z.object({
  fileId: z.string().uuid(),
  checksumSha256: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) {
      return apiError("Invalid CSRF token", 403);
    }

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { fileId, checksumSha256 } = schema.parse(await request.json());
    const ip = getClientIp(request);

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
      .limit(1);

    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    const exists = await objectExists(file.r2Key);
    if (!exists) {
      await db.delete(files).where(eq(files.id, fileId));
      return apiError("Upload incomplete", 400);
    }

    // MAGIC BYTES VALIDATION: Download first 16 bytes (never block)
    try {
      const headerBuffer = await downloadFromR2Bytes(file.r2Key, 16);
      const validation = validateFileMagicBytes(headerBuffer.buffer as ArrayBuffer, file.mimeType);
      if (validation.warning) {
        console.warn(`[UPLOAD WARN] ${validation.warning} — file: ${file.name} (${file.id})`);
      }
    } catch {
      // If we can't read the file header, skip validation (file may be too small)
    }

    // SUSPICIOUS ACTIVITY CHECK
    const suspicious = await checkSuspiciousActivity(userId, "upload", ip);
    if (suspicious.suspicious) {
      await logSuspiciousActivity(userId, "upload", suspicious.reason ?? "Unknown", ip);
    }

    await db
      .update(files)
      .set({ checksumSha256: checksumSha256 ?? null, updatedAt: new Date() })
      .where(eq(files.id, fileId));

    await recalculateUsedBytes(userId);

    await logActivity(sessionUser, "upload", {
      resourceType: "file",
      resourceId: fileId,
      metadata: {
        name: file.name,
        size: file.sizeBytes,
        suspicious: suspicious.suspicious,
        riskLevel: suspicious.riskLevel,
      },
      ip,
    });

    if (file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/") || file.mimeType === "application/pdf" || file.mimeType.startsWith("audio/")) {
      await enqueueJob("generate_thumbnail", { fileId, r2Key: file.r2Key, mimeType: file.mimeType });
    }

    return apiSuccess({ fileId, name: file.name });
  } catch (error) {
    return handleApiError(error);
  }
}
