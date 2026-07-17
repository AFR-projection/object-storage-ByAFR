import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { canAccessUserResource } from "@/lib/auth/permissions";
import { downloadFromR2Stream } from "@/lib/storage/r2";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import JSZip from "jszip";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);

    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    const r2 = await downloadFromR2Stream(file.r2Key);
    if (!r2.body) {
      return apiError("File is empty", 404);
    }

    const chunks: Uint8Array[] = [];
    if (r2.body instanceof ReadableStream) {
      const reader = r2.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } else if ("on" in r2.body && typeof (r2.body as NodeJS.ReadableStream).on === "function") {
      const bufs: Buffer[] = [];
      for await (const chunk of r2.body as AsyncIterable<Buffer>) {
        bufs.push(chunk);
      }
      chunks.push(Buffer.concat(bufs));
    } else {
      return apiError("Unsupported stream type", 500);
    }

    const buffer = Buffer.concat(chunks);
    const zip = await JSZip.loadAsync(buffer);

    const entries: Array<{
      path: string;
      name: string;
      dir: boolean;
      size: number;
      compressedSize: number;
      date: string;
    }> = [];

    let totalFiles = 0;
    let totalFolders = 0;
    let totalSize = 0;
    let totalCompressedSize = 0;

    zip.forEach((path, entry) => {
      const isDir = entry.dir;
      const raw = entry as typeof entry & {
        uncompressedSize?: number;
        compressedSize?: number;
      };
      const size = isDir ? 0 : (raw.uncompressedSize ?? 0);
      const compressedSize = isDir ? 0 : (raw.compressedSize ?? 0);
      const name = path.split("/").pop() || path;
      entries.push({
        path,
        name,
        dir: isDir,
        size,
        compressedSize,
        date: entry.date ? entry.date.toISOString() : "",
      });
      if (isDir) {
        totalFolders++;
      } else {
        totalFiles++;
        totalSize += size;
        totalCompressedSize += compressedSize;
      }
    });

    entries.sort((a, b) => {
      if (a.dir && !b.dir) return -1;
      if (!a.dir && b.dir) return 1;
      return a.path.localeCompare(b.path);
    });

    return apiSuccess({
      entries,
      summary: {
        totalFiles,
        totalFolders,
        totalSize,
        totalCompressedSize,
        format: file.name.split(".").pop()?.toLowerCase() ?? "zip",
      },
    });
  } catch (error) {
    console.error("[ARCHIVE LISTING ERROR]", error);
    return handleApiError(error);
  }
}
