const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  "image/bmp": [[0x42, 0x4d]],
  "video/mp4": [[0x00, 0x00, 0x00]],
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]],
  "video/quicktime": [[0x00, 0x00, 0x00]],
  "video/x-msvideo": [[0x52, 0x49, 0x46, 0x46]],
  "audio/mpeg": [[0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2], [0x49, 0x44, 0x33]],
  "audio/wav": [[0x52, 0x49, 0x46, 0x46]],
  "audio/ogg": [[0x4f, 0x67, 0x67, 0x53]],
  "audio/webm": [[0x1a, 0x45, 0xdf, 0xa3]],
  "audio/mp4": [[0x00, 0x00, 0x00]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "application/zip": [[0x50, 0x4b, 0x03, 0x04]],
  "application/x-rar-compressed": [[0x52, 0x61, 0x72, 0x21]],
  "application/x-7z-compressed": [[0x37, 0x7a, 0xbc, 0xaf]],
  "application/msword": [[0xd0, 0xcf, 0x11, 0xe0]],
  "application/vnd.ms-excel": [[0xd0, 0xcf, 0x11, 0xe0]],
  "application/vnd.ms-powerpoint": [[0xd0, 0xcf, 0x11, 0xe0]],
};

export interface FileValidationResult {
  valid: boolean;
  detectedMime: string | null;
  warning?: string;
}

export function validateFileMagicBytes(
  buffer: ArrayBuffer,
  claimedMimeType: string
): FileValidationResult {
  const bytes = new Uint8Array(buffer);

  // File terlalu kecil — skip validation, biarkan saja
  if (bytes.length < 4) {
    return { valid: true, detectedMime: null };
  }

  // Text types — tidak ada magic bytes yang reliable, langsung valid
  if (
    claimedMimeType.startsWith("text/") ||
    claimedMimeType === "application/json" ||
    claimedMimeType === "application/xml" ||
    claimedMimeType === "application/javascript"
  ) {
    return { valid: true, detectedMime: claimedMimeType };
  }

  // Coba deteksi magic bytes
  const detected = detectMimeFromBytes(bytes);

  // Jika tidak bisa deteksi — tidak masalah, biarkan saja
  if (!detected) {
    return { valid: true, detectedMime: null };
  }

  // Jika terdeteksi dan cocok dengan claimed MIME — valid
  if (isMimeMatch(detected, claimedMimeType)) {
    return { valid: true, detectedMime: detected };
  }

  // Mismatch — tapi TETAP izinkan upload (hanya log warning)
  // Contoh: user klaim "application/octet-stream" tapi isinya JPEG → tidak masalah
  return {
    valid: true,
    detectedMime: detected,
    warning: `Content appears to be ${detected} but claimed ${claimedMimeType}`,
  };
}

function detectMimeFromBytes(bytes: Uint8Array): string | null {
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  // WebP (RIFF....WEBP)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  // PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  // ZIP / Office XML (docx, xlsx, pptx)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "application/zip";
  // RAR
  if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21) return "application/x-rar-compressed";
  // 7z
  if (bytes[0] === 0x37 && bytes[1] === 0x7a && bytes[2] === 0xbc && bytes[3] === 0xaf) return "application/x-7z-compressed";
  // OGG (audio/video)
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "audio/ogg";
  // MP3
  if ((bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) ||
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)) return "audio/mpeg";
  // MP4/MOV (ftyp box)
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    if (bytes[8] === 0x71 && bytes[9] === 0x74) return "video/quicktime"; // qt
    return "video/mp4";
  }
  // WebM (Matroska)
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  // Old MS Office (doc, xls, ppt)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "application/msword";

  return null;
}

function isMimeMatch(detected: string, claimed: string): boolean {
  // Exact match
  if (detected === claimed) return true;

  // ZIP detected but claimed as Office XML — that's fine (docx/xlsx/pptx are ZIP-based)
  if (detected === "application/zip") {
    if (claimed.includes("word") || claimed.includes("sheet") || claimed.includes("presentation") || claimed.includes("opendocument")) {
      return true;
    }
  }

  // Office detected but claimed as generic — fine
  if (detected === "application/msword") {
    if (claimed.includes("msword") || claimed.includes("officedocument") || claimed.includes("octet-stream")) {
      return true;
    }
  }

  // WebM detected but claimed as video or audio — both use same container
  if (detected === "video/webm" && (claimed.startsWith("video/") || claimed.startsWith("audio/"))) {
    return true;
  }

  // MP4 detected but claimed as video or audio
  if (detected === "video/mp4" && (claimed.startsWith("video/") || claimed.startsWith("audio/"))) {
    return true;
  }

  // OGG detected but claimed as video or audio
  if (detected === "audio/ogg" && (claimed.startsWith("video/") || claimed.startsWith("audio/"))) {
    return true;
  }

  return false;
}

export function detectMimeType(buffer: ArrayBuffer): string | null {
  return detectMimeFromBytes(new Uint8Array(buffer));
}
