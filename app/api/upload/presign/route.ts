import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { files, users } from "@/lib/db/schema";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import {
  buildR2Key,
  getPresignedUploadUrl,
  getMaxFileSize,
} from "@/lib/storage/r2";
import { validateCsrf, checkRateLimit } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

const schema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) {
      return apiError("Invalid CSRF token", 403);
    }

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const ip = getClientIp(request);

    const rateLimit = await checkRateLimit(`upload:${userId}`, 60, 60000);
    if (!rateLimit.allowed) return apiError("Upload rate limit exceeded", 429);

    const body = schema.parse(await request.json());

    if (body.sizeBytes > getMaxFileSize()) {
      return apiError("File exceeds maximum size", 400);
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return apiError("User not found", 404);

    if (user.usedBytes + body.sizeBytes > user.quotaBytes) {
      return apiError("Storage quota exceeded", 400);
    }

    const [file] = await db
      .insert(files)
      .values({
        userId,
        folderId: body.folderId ?? null,
        name: body.filename,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        r2Key: "pending",
        checksumSha256: null,
      })
      .returning();

    const r2Key = buildR2Key(userId, file.id, body.filename);
    await db.update(files).set({ r2Key }).where(eq(files.id, file.id));

    const uploadUrl = await getPresignedUploadUrl(r2Key, body.mimeType, body.sizeBytes);

    return apiSuccess({
      fileId: file.id,
      uploadUrl,
      r2Key,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
