import "dotenv/config";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { files } from "../lib/db/schema";
import { QUEUE_NAME } from "../lib/queue";

const execFileAsync = promisify(execFile);

const THUMB_SIZES = [150, 300, 600, 1200];

function getRedisConnection() {
  if (process.env.REDIS_DISABLED === "true") {
    return null;
  }

  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port || "6379", 10),
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

const redisConnection = getRedisConnection();
if (!redisConnection) {
  console.log("Worker skipped: REDIS_DISABLED=true");
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 5 });
const db = drizzle(sql, { schema });

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

async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
  );
  return Buffer.from(await response.Body!.transformToByteArray());
}

async function uploadToR2(key: string, body: Buffer, contentType: string) {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

async function generateImageThumbnails(fileId: string, buffer: Buffer) {
  const sizes = [150, 300, 600, 1200];
  const uploads: Promise<void>[] = [];

  for (const size of sizes) {
    const key = `thumbnails/${fileId}_${size}.webp`;
    const pipeline = sharp(buffer)
      .resize(size, size, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 });

    const thumbBuffer = await pipeline.toBuffer();
    uploads.push(uploadToR2(key, thumbBuffer, "image/webp"));
  }

  await Promise.all(uploads);
}

async function generateVideoThumbnail(fileId: string, r2Key: string) {
  const buffer = await downloadFromR2(r2Key);
  const fs = await import("fs/promises");
  const tmpIn = `/tmp/${fileId}-input`;
  await fs.writeFile(tmpIn, buffer);

  try {
    // Generate multiple sizes from video frame
    for (const size of THUMB_SIZES) {
      const tmpOut = `/tmp/${fileId}-thumb-${size}.webp`;
      try {
        await execFileAsync("ffmpeg", [
          "-i", tmpIn,
          "-ss", "00:00:01",
          "-vframes", "1",
          "-vf", `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2`,
          "-y", tmpOut,
        ]);
        const thumbBuffer = await fs.readFile(tmpOut);
        // Convert to webp via sharp
        const webpBuffer = await sharp(thumbBuffer).webp({ quality: 80 }).toBuffer();
        await uploadToR2(`thumbnails/${fileId}_${size}.webp`, webpBuffer, "image/webp");
      } catch {
        // If size fails, skip it
      } finally {
        await fs.unlink(tmpOut).catch(() => {});
      }
    }
  } finally {
    await fs.unlink(tmpIn).catch(() => {});
  }
}

async function generatePdfThumbnail(fileId: string, r2Key: string) {
  const buffer = await downloadFromR2(r2Key);
  const fs = await import("fs/promises");
  const tmpIn = `/tmp/${fileId}-input.pdf`;
  const tmpOut = `/tmp/${fileId}-thumb.png`;
  await fs.writeFile(tmpIn, buffer);

  try {
    // Use ffmpeg to extract first page of PDF as image
    await execFileAsync("ffmpeg", [
      "-i", tmpIn,
      "-vframes", "1",
      "-vf", "scale=600:-1",
      "-y", tmpOut,
    ]);
    const thumbBuffer = await fs.readFile(tmpOut);

    // Generate multiple sizes
    for (const size of THUMB_SIZES) {
      const webpBuffer = await sharp(thumbBuffer)
        .resize(size, size, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      await uploadToR2(`thumbnails/${fileId}_${size}.webp`, webpBuffer, "image/webp");
    }
  } catch {
    // PDF thumbnail generation failed, skip
  } finally {
    await fs.unlink(tmpIn).catch(() => {});
    await fs.unlink(tmpOut).catch(() => {});
  }
}

async function generateAudioThumbnail(fileId: string, r2Key: string) {
  const buffer = await downloadFromR2(r2Key);
  const fs = await import("fs/promises");
  const tmpIn = `/tmp/${fileId}-input`;
  const tmpOut = `/tmp/${fileId}-cover.jpg`;
  await fs.writeFile(tmpIn, buffer);

  try {
    // Try to extract embedded album art
    await execFileAsync("ffmpeg", [
      "-i", tmpIn,
      "-vframes", "1",
      "-an",
      "-y", tmpOut,
    ]);
    const coverBuffer = await fs.readFile(tmpOut);

    for (const size of THUMB_SIZES) {
      const webpBuffer = await sharp(coverBuffer)
        .resize(size, size, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      await uploadToR2(`thumbnails/${fileId}_${size}.webp`, webpBuffer, "image/webp");
    }
  } catch {
    // No embedded cover art, generate waveform-style placeholder
    const placeholderSize = 600;
    const svg = `<svg width="${placeholderSize}" height="${placeholderSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#10b981"/>
          <stop offset="100%" stop-color="#06b6d4"/>
        </linearGradient>
      </defs>
      <rect width="${placeholderSize}" height="${placeholderSize}" fill="#0f172a"/>
      <rect x="0" y="${placeholderSize - 80}" width="${placeholderSize}" height="80" fill="url(#g)" opacity="0.15"/>
      <g transform="translate(${placeholderSize / 2 - 60}, ${placeholderSize / 2 - 40})">
        <path d="M30 20v40M42 12v56M54 28v24M66 8v64M78 20v40M90 16v48M102 24v32M114 12v56" stroke="url(#g)" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
      </g>
      <circle cx="${placeholderSize / 2}" cy="${placeholderSize / 2 + 60}" r="20" fill="url(#g)" opacity="0.6"/>
      <polygon points="${placeholderSize / 2 - 6},${placeholderSize / 2 + 52} ${placeholderSize / 2 - 6},${placeholderSize / 2 + 68} ${placeholderSize / 2 + 10},${placeholderSize / 2 + 60}" fill="white" opacity="0.9"/>
    </svg>`;

    for (const size of THUMB_SIZES) {
      const webpBuffer = await sharp(Buffer.from(svg))
        .resize(size, size)
        .webp({ quality: 80 })
        .toBuffer();
      await uploadToR2(`thumbnails/${fileId}_${size}.webp`, webpBuffer, "image/webp");
    }
  } finally {
    await fs.unlink(tmpIn).catch(() => {});
    await fs.unlink(tmpOut).catch(() => {});
  }
}

async function generateThumbnail(fileId: string, r2Key: string, mimeType: string) {
  if (r2Key.startsWith("notes/")) return;

  const thumbKey = `thumbnails/${fileId}_300.webp`;

  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
    const buffer = await downloadFromR2(r2Key);
    await generateImageThumbnails(fileId, buffer);
  } else if (mimeType.startsWith("video/")) {
    await generateVideoThumbnail(fileId, r2Key);
  } else if (mimeType === "application/pdf") {
    await generatePdfThumbnail(fileId, r2Key);
  } else if (mimeType.startsWith("audio/")) {
    await generateAudioThumbnail(fileId, r2Key);
  } else {
    return;
  }

  await db.update(files).set({ thumbnailKey: thumbKey }).where(eq(files.id, fileId));
}

async function compressImage(fileId: string, r2Key: string, mimeType: string) {
  const buffer = await downloadFromR2(r2Key);
  const output = await sharp(buffer).jpeg({ quality: 80 }).toBuffer();
  await uploadToR2(r2Key, output, mimeType);
  await db.update(files).set({ sizeBytes: output.length }).where(eq(files.id, fileId));
}

async function trimMedia(
  fileId: string,
  r2Key: string,
  mimeType: string,
  startSeconds: number,
  endSeconds: number
) {
  const buffer = await downloadFromR2(r2Key);
  const fs = await import("fs/promises");
  const tmpIn = `/tmp/${fileId}-trim-in`;
  const ext = mimeType.includes("video") ? "mp4" : "mp3";
  const tmpOut = `/tmp/${fileId}-trim-out.${ext}`;
  await fs.writeFile(tmpIn, buffer);

  try {
    await execFileAsync("ffmpeg", [
      "-i", tmpIn,
      "-ss", String(startSeconds),
      "-to", String(endSeconds),
      "-c", "copy",
      "-y", tmpOut,
    ]);
    const output = await fs.readFile(tmpOut);
    await uploadToR2(r2Key, output, mimeType);
    await db.update(files).set({ sizeBytes: output.length }).where(eq(files.id, fileId));
  } finally {
    await fs.unlink(tmpIn).catch(() => {});
    await fs.unlink(tmpOut).catch(() => {});
  }
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { type, fileId, r2Key, mimeType, startSeconds, endSeconds } = job.data as {
      type: string;
      fileId: string;
      r2Key: string;
      mimeType: string;
      startSeconds?: number;
      endSeconds?: number;
    };

    switch (type) {
      case "generate_thumbnail":
        await generateThumbnail(fileId, r2Key, mimeType);
        break;
      case "compress_image":
        await compressImage(fileId, r2Key, mimeType);
        break;
      case "trim_media":
        if (startSeconds !== undefined && endSeconds !== undefined) {
          await trimMedia(fileId, r2Key, mimeType, startSeconds, endSeconds);
        }
        break;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed:`, err?.message ?? err));
worker.on("error", (err) => console.error("Worker error:", err.message));

console.log(`Storage worker started (redis://${redisConnection.host}:${redisConnection.port})`);
