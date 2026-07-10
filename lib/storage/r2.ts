import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sanitizeFilename } from "@/lib/utils";

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set");
  return bucket;
}

export function buildR2Key(userId: string, fileId: string, filename: string): string {
  return `${userId}/${fileId}/${sanitizeFilename(filename)}`;
}

export function getThumbnailKey(fileId: string, size: number, ext: string = "webp"): string {
  return `thumbnails/${fileId}_${size}.${ext}`;
}

export function getLegacyThumbnailKey(fileId: string): string {
  return `thumbnails/${fileId}.jpg`;
}

export async function getPresignedUploadUrl(
  r2Key: string,
  mimeType: string,
  sizeBytes: number
): Promise<string> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: r2Key,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });

  const expiry = parseInt(process.env.UPLOAD_URL_EXPIRY_SECONDS ?? "900", 10);
  return getSignedUrl(client, command, { expiresIn: expiry });
}

export async function getPresignedDownloadUrl(r2Key: string): Promise<string> {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: r2Key,
  });

  const expiry = parseInt(process.env.DOWNLOAD_URL_EXPIRY_SECONDS ?? "60", 10);
  return getSignedUrl(client, command, { expiresIn: expiry });
}

export async function deleteR2Object(r2Key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: r2Key,
    })
  );
}

export async function copyR2Object(sourceKey: string, destKey: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new CopyObjectCommand({
      Bucket: getBucket(),
      CopySource: `${getBucket()}/${sourceKey}`,
      Key: destKey,
    })
  );
}

export async function downloadFromR2Bytes(r2Key: string, maxBytes: number = 16): Promise<Buffer> {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: r2Key,
      Range: `bytes=0-${maxBytes - 1}`,
    })
  );
  return Buffer.from(await response.Body!.transformToByteArray());
}

export async function downloadFromR2Stream(r2Key: string) {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: r2Key,
    })
  );
  return {
    body: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    contentRange: response.ContentRange,
    eTag: response.ETag,
  };
}

export async function objectExists(r2Key: string): Promise<boolean> {
  try {
    const client = getR2Client();
    await client.send(
      new HeadObjectCommand({
        Bucket: getBucket(),
        Key: r2Key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

// All file types allowed - security is handled at download/serve time, not upload time
export const ALLOWED_MIME_TYPES = new Set<string>();

export function isAllowedMimeType(_mimeType: string): boolean {
  // Allow everything - dangerous files are neutralized at download time
  // by forcing Content-Disposition: attachment (never inline)
  return true;
}

export function getMaxFileSize(): number {
  return parseInt(process.env.MAX_FILE_SIZE_BYTES ?? "5368709120", 10);
}
