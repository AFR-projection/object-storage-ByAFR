import { NextRequest } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getAccessibleFile, getEffectiveUserId } from "@/lib/auth/permissions";
import { objectExists } from "@/lib/storage/r2";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { validateCsrf } from "@/lib/security";
import { enqueueJob } from "@/lib/queue";
import { snapshotFileVersion } from "@/lib/files/versions";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

const editSchema = z.object({
  fileId: z.string().uuid(),
  action: z.enum(["crop", "rotate", "resize", "compress"]),
  crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  rotate: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  quality: z.number().min(1).max(100).optional(),
});

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const body = editSchema.parse(await request.json());
    void getClientIp(request);

    const accessible = await getAccessibleFile(sessionUser, body.fileId);
    if (!accessible?.canEdit) {
      return apiError("File not found", 404);
    }
    const file = accessible.file;

    if (!file.mimeType.startsWith("image/")) {
      return apiError("Only images can be edited", 400);
    }

    if (file.r2Key.startsWith("notes/") || !(await objectExists(file.r2Key))) {
      return apiError("File belum ada di storage. Upload ulang terlebih dahulu.", 404);
    }

    await snapshotFileVersion(file, getEffectiveUserId(sessionUser));

    const client = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME!;

    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: file.r2Key })
    );
    const buffer = Buffer.from(await response.Body!.transformToByteArray());

    let pipeline = sharp(buffer);

    if (body.rotate) pipeline = pipeline.rotate(body.rotate);
    if (body.crop) {
      pipeline = pipeline.extract({
        left: Math.round(body.crop.x),
        top: Math.round(body.crop.y),
        width: Math.round(body.crop.width),
        height: Math.round(body.crop.height),
      });
    }
    if (body.width || body.height) {
      pipeline = pipeline.resize(body.width, body.height, { fit: "inside" });
    }
    if (body.action === "compress" || body.quality) {
      pipeline = pipeline.jpeg({ quality: body.quality ?? 80 });
    }

    const output = await pipeline.toBuffer();

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: file.r2Key,
        Body: output,
        ContentType: file.mimeType,
      })
    );

    await db
      .update(files)
      .set({ sizeBytes: output.length, updatedAt: new Date() })
      .where(eq(files.id, body.fileId));

    await enqueueJob("generate_thumbnail", {
      fileId: body.fileId,
      r2Key: file.r2Key,
      mimeType: file.mimeType,
    });

    return apiSuccess({ sizeBytes: output.length });
  } catch (error) {
    return handleApiError(error);
  }
}

const trimSchema = z.object({
  fileId: z.string().uuid(),
  startSeconds: z.number().min(0),
  endSeconds: z.number().positive(),
});

export async function PUT(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const body = trimSchema.parse(await request.json());

    const accessible = await getAccessibleFile(sessionUser, body.fileId);
    if (!accessible?.canEdit) {
      return apiError("File not found", 404);
    }
    const file = accessible.file;

    await enqueueJob("trim_media", {
      fileId: body.fileId,
      r2Key: file.r2Key,
      mimeType: file.mimeType,
      startSeconds: body.startSeconds,
      endSeconds: body.endSeconds,
    });

    return apiSuccess({ queued: true });
  } catch (error) {
    return handleApiError(error);
  }
}
