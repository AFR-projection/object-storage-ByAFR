import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sanitizeFilename } from "@/lib/utils";
import { maxUploadBytes, isUploadAllowed } from "@/lib/admin-settings";
import { MULTIPART_PART_SIZE_BYTES } from "@/lib/storage/upload-constants";

export {
  MULTIPART_THRESHOLD_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_PARALLEL_PARTS,
} from "@/lib/storage/upload-constants";

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
  if (!r2Key || r2Key === "pending" || r2Key.startsWith("notes/")) return;
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: r2Key,
    })
  );
}

/** Batch delete R2 keys (chunks of 1000). Skips pending/notes keys. */
export async function deleteR2Objects(r2Keys: string[]): Promise<void> {
  const keys = [...new Set(r2Keys)].filter(
    (k) => k && k !== "pending" && !k.startsWith("notes/")
  );
  if (keys.length === 0) return;

  const client = getR2Client();
  const bucket = getBucket();
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
  }
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

export type MultipartPresign = {
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; url: string }[];
};

export function planMultipartParts(sizeBytes: number): number {
  return Math.ceil(sizeBytes / MULTIPART_PART_SIZE_BYTES);
}

/** Create multipart upload and return presigned URLs for each part. */
export async function createMultipartUpload(
  r2Key: string,
  mimeType: string,
  sizeBytes: number
): Promise<MultipartPresign> {
  const client = getR2Client();
  const bucket = getBucket();
  const expiry = parseInt(process.env.UPLOAD_URL_EXPIRY_SECONDS ?? "900", 10);

  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: r2Key,
      ContentType: mimeType,
    })
  );

  if (!created.UploadId) throw new Error("Failed to create multipart upload");

  const partCount = planMultipartParts(sizeBytes);
  const parts: { partNumber: number; url: string }[] = [];

  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const url = await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: bucket,
        Key: r2Key,
        UploadId: created.UploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: expiry }
    );
    parts.push({ partNumber, url });
  }

  return {
    uploadId: created.UploadId,
    partSize: MULTIPART_PART_SIZE_BYTES,
    parts,
  };
}

export async function completeMultipartUpload(
  r2Key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  const client = getR2Client();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: r2Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
      },
    })
  );
}

export async function abortMultipartUpload(r2Key: string, uploadId: string): Promise<void> {
  const client = getR2Client();
  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: getBucket(),
        Key: r2Key,
        UploadId: uploadId,
      })
    );
  } catch {
    // ignore
  }
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

export async function headObject(r2Key: string) {
  const client = getR2Client();
  const response = await client.send(
    new HeadObjectCommand({
      Bucket: getBucket(),
      Key: r2Key,
    })
  );
  return {
    contentLength: response.ContentLength ?? 0,
    contentType: response.ContentType,
    eTag: response.ETag,
  };
}

export async function downloadFromR2Stream(r2Key: string, byteRange?: string) {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: r2Key,
      ...(byteRange ? { Range: byteRange } : {}),
    })
  );
  return {
    body: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    contentRange: response.ContentRange,
    eTag: response.ETag,
    statusCode: response.$metadata.httpStatusCode,
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

export function isAllowedMimeType(mimeType: string, filename = "file"): boolean {
  return isUploadAllowed(mimeType, filename).allowed;
}

export function getMaxFileSize(): number {
  return maxUploadBytes();
}
