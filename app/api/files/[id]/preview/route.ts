import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { getAccessibleFile } from "@/lib/auth/permissions";
import { downloadFromR2Stream, objectExists, getPresignedDownloadUrl } from "@/lib/storage/r2";
import { recordBandwidth, BandwidthQuotaError } from "@/lib/billing/bandwidth";
import { apiSuccess, apiError } from "@/lib/api/response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;
    const format = request.nextUrl.searchParams.get("format");

    const accessible = await getAccessibleFile(sessionUser, id);
    if (!accessible?.canView) {
      return apiError("File not found", 404);
    }
    const file = accessible.file;

    if (file.isNote || file.r2Key.startsWith("notes/")) {
      return apiError("Preview not available for notes", 400);
    }

    const exists = await objectExists(file.r2Key);
    if (!exists) {
      return apiError("File belum ada di storage. Coba upload ulang.", 404);
    }

    if (format === "json") {
      try {
        await recordBandwidth(file.userId, file.sizeBytes);
      } catch (err) {
        if (err instanceof BandwidthQuotaError) {
          return apiError("BANDWIDTH_QUOTA_EXCEEDED", 429);
        }
        throw err;
      }
      const url = await getPresignedDownloadUrl(file.r2Key);
      return apiSuccess({ url });
    }

    try {
      await recordBandwidth(file.userId, file.sizeBytes);
    } catch (err) {
      if (err instanceof BandwidthQuotaError) {
        return apiError("BANDWIDTH_QUOTA_EXCEEDED", 429);
      }
      throw err;
    }

    const r2 = await downloadFromR2Stream(file.r2Key);

    if (!r2.body) {
      return apiError("File kosong", 404);
    }

    let stream: ReadableStream;
    if (r2.body instanceof ReadableStream) {
      stream = r2.body;
    } else if ("pipe" in r2.body && typeof r2.body.pipe === "function") {
      stream = new ReadableStream({
        start(controller) {
          const nodeStream = r2.body as NodeJS.ReadableStream & { on: Function; pipe: Function };
          nodeStream.on("data", (chunk: Uint8Array) => controller.enqueue(chunk));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err: Error) => controller.error(err));
        },
      });
    } else {
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
