import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { canAccessUserResource } from "@/lib/auth/permissions";
import { downloadFromR2Stream } from "@/lib/storage/r2";
import { apiError, handleApiError } from "@/lib/api/response";
import JSZip from "jszip";

const TEXT_TYPES = new Set([
  "txt", "md", "mdx", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt",
  "swift", "c", "cpp", "h", "hpp", "cs", "php", "html", "htm", "css", "scss",
  "less", "sass", "sql", "sh", "bash", "zsh", "fish", "ps1", "bat", "vue",
  "svelte", "astro", "env", "gitignore", "dockerignore", "log", "csv", "tsv",
]);

const MIME_MAP: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
};

function getMime(ext: string): string {
  return MIME_MAP[ext] || (TEXT_TYPES.has(ext) ? "text/plain" : "application/octet-stream");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;
    const filePath = request.nextUrl.searchParams.get("path");

    if (!filePath) {
      return apiError("Missing path parameter", 400);
    }

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
    } else if ("on" in r2.body && typeof (r2.body as any).on === "function") {
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

    const entry = zip.file(filePath);
    if (!entry) {
      return apiError(`File "${filePath}" not found in archive`, 404);
    }

    const content = await entry.async("uint8array");
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const mime = getMime(ext);

    const headers = new Headers();
    headers.set("Content-Type", mime);
    headers.set("Content-Length", String(content.length));
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(entry.name)}"`);

    return new Response(new Uint8Array(content), { status: 200, headers });
  } catch (error) {
    console.error("[ARCHIVE EXTRACT ERROR]", error);
    return handleApiError(error);
  }
}
