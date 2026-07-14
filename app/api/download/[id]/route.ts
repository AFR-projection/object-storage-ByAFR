import { NextRequest } from "next/server";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getAccessibleFile } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/auth/audit";
import { getPresignedDownloadUrl, objectExists } from "@/lib/storage/r2";
import { recordBandwidth, BandwidthQuotaError } from "@/lib/billing/bandwidth";
import { apiError, handleApiError } from "@/lib/api/response";

// Dangerous extensions that should NEVER be rendered inline, always forced download
const FORCED_DOWNLOAD_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "pif", "vbs", "vbe", "wsf", "wsh",
  "sh", "bash", "csh", "ksh", "zsh", "fish",
  "php", "phtml", "php3", "php4", "php5", "php7",
  "pl", "py", "rb", "js", "mjs", "cjs",
  "ps1", "psm1", "psd1",
  "jsp", "jspx", "asp", "aspx", "ascx", "ashx", "asmx",
  "htaccess", "htpasswd",
  "env", "git", "svn", "hg",
  "svg", "html", "htm", "xhtml",
  "xml", "xsl", "xslt",
  "jar", "war", "ear",
  "dll", "so", "dylib", "bin",
  "reg", "inf", "ini",
  "iso", "img", "vmdk",
]);

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
}

function getSafeMimeType(mimeType: string, filename: string): string {
  const ext = getExtension(filename);

  if (FORCED_DOWNLOAD_EXTENSIONS.has(ext)) {
    return "application/octet-stream";
  }

  if (mimeType === "image/svg+xml" || ext === "svg") {
    return "application/octet-stream";
  }

  return mimeType;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;
    const ip = getClientIp(request);

    const accessible = await getAccessibleFile(sessionUser, id);
    if (!accessible?.canView) {
      return apiError("File not found", 404);
    }
    const file = accessible.file;

    if (file.isNote || file.r2Key.startsWith("notes/")) {
      return apiError("Notes cannot be downloaded as files", 400);
    }

    const exists = await objectExists(file.r2Key);
    if (!exists) {
      return apiError("File belum ter-upload ke storage atau sudah hilang", 404);
    }

    try {
      await recordBandwidth(file.userId, file.sizeBytes);
    } catch (err) {
      if (err instanceof BandwidthQuotaError) {
        return apiError("BANDWIDTH_QUOTA_EXCEEDED", 429);
      }
      throw err;
    }

    await logActivity(sessionUser, "download", {
      resourceType: "file",
      resourceId: id,
      metadata: { name: file.name },
      ip,
    });

    const url = await getPresignedDownloadUrl(file.r2Key);
    const response = Response.redirect(url, 302);

    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    const safeMimeType = getSafeMimeType(file.mimeType, file.name);
    const ext = getExtension(file.name);

    if (FORCED_DOWNLOAD_EXTENSIONS.has(ext) || safeMimeType === "application/octet-stream") {
      newResponse.headers.set("Content-Type", "application/octet-stream");
      newResponse.headers.set("Content-Disposition", `attachment; filename="${file.name}"`);
    }

    newResponse.headers.set("X-Content-Type-Options", "nosniff");

    return newResponse;
  } catch (error) {
    return handleApiError(error);
  }
}
