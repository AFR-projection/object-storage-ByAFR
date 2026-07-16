import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { getEffectiveUserId, canAccessUserResource } from "@/lib/auth/permissions";
import { downloadFromR2Stream, objectExists } from "@/lib/storage/r2";
import { apiError } from "@/lib/api/response";

const THUMB_SIZES = [150, 300, 600, 1200] as const;
type ThumbSize = (typeof THUMB_SIZES)[number];

function parseSize(val: string | null): ThumbSize {
  const n = parseInt(val ?? "300", 10);
  if (THUMB_SIZES.includes(n as ThumbSize)) return n as ThumbSize;
  return 300;
}

function getThumbKey(fileId: string, size: ThumbSize, ext: string = "webp"): string {
  return `thumbnails/${fileId}_${size}.${ext}`;
}

function getLegacyThumbKey(fileId: string): string {
  return `thumbnails/${fileId}.jpg`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { id } = await params;
    const size = parseSize(request.nextUrl.searchParams.get("size"));

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);

    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    const thumbKey = getThumbKey(file.id, size);
    const legacyKey = getLegacyThumbKey(file.id);

    // Prefer the size-specific key, then whatever thumbnailKey points to
    // (e.g. legacy .jpg or the default 300px), then the original image.
    const keysToTry = [thumbKey];
    if (file.thumbnailKey && !keysToTry.includes(file.thumbnailKey)) {
      keysToTry.push(file.thumbnailKey);
    }
    if (file.thumbnailKey === legacyKey && !keysToTry.includes(legacyKey)) {
      keysToTry.push(legacyKey);
    }
    if (file.mimeType.startsWith("image/")) {
      keysToTry.push(file.r2Key);
    }

    for (const r2Key of keysToTry) {
      try {
        if (!await objectExists(r2Key)) continue;
        const r2 = await downloadFromR2Stream(r2Key);
        if (!r2.body) continue;

        let stream: ReadableStream;
        if (r2.body instanceof ReadableStream) {
          stream = r2.body;
        } else if ("pipe" in r2.body && typeof r2.body.pipe === "function") {
          stream = new ReadableStream({
            start(controller) {
              const nodeStream = r2.body as NodeJS.ReadableStream & { on: Function };
              nodeStream.on("data", (chunk: Uint8Array) => controller.enqueue(chunk));
              nodeStream.on("end", () => controller.close());
              nodeStream.on("error", (err: Error) => controller.error(err));
            },
          });
        } else {
          stream = r2.body as unknown as ReadableStream;
        }

        const headers = new Headers();
        const contentType = r2Key === file.r2Key
          ? file.mimeType
          : r2Key.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
        headers.set("Content-Type", contentType);
        headers.set("Content-Length", String(r2.contentLength ?? 0));
        headers.set("Cache-Control", "public, max-age=86400");

        return new Response(stream, { status: 200, headers });
      } catch {
        continue;
      }
    }

    return apiError("Thumbnail not available", 404);
  } catch (error) {
    console.error("[THUMBNAIL ERROR]", error);
    return apiError("Thumbnail not available", 500);
  }
}
