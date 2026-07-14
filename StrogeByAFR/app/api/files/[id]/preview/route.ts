import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { canAccessUserResource } from "@/lib/auth/permissions";
import { downloadFromR2Stream, objectExists, getPresignedDownloadUrl } from "@/lib/storage/r2";
import { apiSuccess, apiError } from "@/lib/api/response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;
    const format = request.nextUrl.searchParams.get("format");

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);

    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    if (file.isNote || file.r2Key.startsWith("notes/")) {
      return apiError("Preview not available for notes", 400);
    }

    const exists = await objectExists(file.r2Key);
    if (!exists) {
      return apiError("File belum ada di storage. Coba upload ulang.", 404);
    }

    // Mode JSON: untuk getPreviewUrl() di client (image/pdf/text preview)
    if (format === "json") {
      const url = await getPresignedDownloadUrl(file.r2Key);
      return apiSuccess({ url });
    }

    // Mode stream: download file dari R2 dan stream langsung ke browser
    const r2 = await downloadFromR2Stream(file.r2Key);

    if (!r2.body) {
      return apiError("File kosong", 404);
    }

    // Convert Node.js Readable to Web ReadableStream if needed
    let stream: ReadableStream;
    if (r2.body instanceof ReadableStream) {
      stream = r2.body;
    } else if ("pipe" in r2.body && typeof r2.body.pipe === "function") {
      // Node.js Readable stream — convert to Web ReadableStream
      stream = new ReadableStream({
        start(controller) {
          const nodeStream = r2.body as NodeJS.ReadableStream & { on: Function; pipe: Function };
          nodeStream.on("data", (chunk: Uint8Array) => controller.enqueue(chunk));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err: Error) => controller.error(err));
        },
      });
    } else {
      // Fallback: try to use as ReadableStream directly
      stream = r2.body as unknown as ReadableStream;
    }

    const headers = new Headers();
    headers.set("Content-Type", file.mimeType);
    headers.set("Content-Length", String(r2.contentLength ?? 0));
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Accept-Ranges", "bytes");

    return new Response(stream, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[PREVIEW ERROR]", error);
    return apiError("Gagal memuat preview", 500);
  }
}
