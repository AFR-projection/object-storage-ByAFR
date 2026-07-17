"use client";

import { getCsrfToken } from "@/lib/api/client";
import {
  decryptToBlob,
  isEncryptionMeta,
  type EncryptionMetaV1,
} from "@/lib/crypto/client-encryption";
import {
  startDownload,
  finishDownload,
  failDownload,
  updateDownloadProgress,
} from "./download-store";
import { setPendingEncryptedDownload } from "./encrypted-download-store";

/** Trigger a browser download of a blob URL with the given filename. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the browser has grabbed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Minimal shape needed to decide how to download a file. Any record with these
 * fields works (the full DB File row satisfies it).
 */
export type DownloadableFile = {
  id: string;
  name: string;
  mimeType: string;
  encrypted?: boolean | null;
  encryptionMeta?: unknown;
};

/**
 * Central entry point for downloading a file. For a normal file this behaves
 * exactly like {@link downloadFile}. For an END-TO-END ENCRYPTED file, a plain
 * download would only yield ciphertext under the real filename — so instead we
 * hand it off to the global passphrase dialog, which decrypts in the browser
 * and saves the real file. The passphrase never touches the server.
 *
 * Prefer this over calling downloadFile directly wherever the full file record
 * is available.
 */
export function requestDownload(file: DownloadableFile) {
  if (file.encrypted) {
    if (!isEncryptionMeta(file.encryptionMeta)) {
      // No metadata means we can't decrypt — surface it instead of handing over
      // unusable bytes.
      const id = startDownload(file.name);
      failDownload(id, "File terenkripsi tapi metadata enkripsi tidak ada");
      return;
    }
    setPendingEncryptedDownload({
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      meta: file.encryptionMeta as EncryptionMetaV1,
    });
    return;
  }
  downloadFile(file.id, file.name);
}

/**
 * Fetch an encrypted file's ciphertext, decrypt it in the browser with the
 * given passphrase, and save the real plaintext file. Used by the global
 * encrypted-download dialog. Throws on wrong passphrase so the dialog can show
 * an inline error and let the user retry (no download-store failure toast).
 */
export async function saveDecryptedFile(
  fileId: string,
  fileName: string,
  mimeType: string,
  meta: EncryptionMetaV1,
  passphrase: string
) {
  // Fetch ciphertext (auth-gated, same endpoint the preview uses).
  const res = await fetch(`/api/files/${fileId}/preview`);
  if (!res.ok) throw new Error("Gagal mengambil file terenkripsi");
  const cipher = await res.arrayBuffer();

  // decryptToBlob throws on a wrong passphrase — let it propagate to the dialog.
  const blob = await decryptToBlob(cipher, passphrase, meta, mimeType);

  // Only record the download in the manager once decryption succeeded.
  const id = startDownload(fileName);
  try {
    saveBlob(blob, fileName);
    finishDownload(id);
  } catch (err) {
    failDownload(id, err instanceof Error ? err.message : "Gagal menyimpan file");
    throw err;
  }
}

/**
 * Download helper for in-viewer toolbar buttons. Viewers receive a `src` that is
 * either a decrypted `blob:` URL (for E2E-encrypted files, already decrypted in
 * the browser for preview) or a server URL. When it's a blob we save that real
 * decrypted content directly under the correct filename; otherwise we fall back
 * to the efficient R2 download path (no server bandwidth, no in-memory copy).
 */
export function downloadViewerSource(src: string, fileId: string, fileName: string) {
  if (src.startsWith("blob:")) {
    const id = startDownload(fileName);
    try {
      const a = document.createElement("a");
      a.href = src;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      finishDownload(id);
    } catch (err) {
      failDownload(id, err instanceof Error ? err.message : "Gagal menyimpan file");
    }
    return;
  }
  downloadFile(fileId, fileName);
}

/**
 * Single-file download. Goes straight to R2 via a top-level navigation, which
 * is the cheapest and most reliable path (no server bandwidth, resumable by the
 * browser). We can't observe byte progress here, so the store entry flips from
 * started → done optimistically.
 */
export function downloadFile(fileId: string, fileName: string) {
  const id = startDownload(fileName);
  try {
    // A hidden iframe/anchor navigation avoids opening a blank tab while still
    // letting the server's Content-Disposition force the download.
    const a = document.createElement("a");
    a.href = `/api/download/${fileId}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The browser owns the transfer; mark done shortly after handing off.
    setTimeout(() => finishDownload(id), 800);
  } catch (err) {
    failDownload(id, err instanceof Error ? err.message : "Failed to start download");
  }
}

/**
 * Single-file download WITH live progress + speed, via the server proxy
 * (?proxy=1). Costs server bandwidth, so this is opt-in — call it only when the
 * user explicitly wants progress (e.g. a "Download with progress" action).
 *
 * Includes resume: if the stream breaks mid-transfer, it retries with a Range
 * request starting at the last received byte, up to `maxRetries` times.
 */
export async function downloadFileWithProgress(
  fileId: string,
  fileName: string,
  maxRetries = 3
) {
  const id = startDownload(fileName);
  const url = `/api/download/${fileId}?proxy=1`;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let total = 0;
  let attempt = 0;

  // Smoothed speed state, preserved across resume attempts.
  let lastTime = performance.now();
  let lastLoaded = 0;
  let speed = 0;

  for (;;) {
    try {
      const headers: HeadersInit = {};
      // Resume from where we left off after a mid-stream failure.
      if (loaded > 0) headers["Range"] = `bytes=${loaded}-`;

      const res = await fetch(url, { headers });
      if (!res.ok && res.status !== 206) {
        // 416 = range not satisfiable (already have it all) → treat as done.
        if (res.status === 416 && loaded > 0) break;
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Download failed (${res.status})`);
      }

      if (total === 0) {
        const len = Number(res.headers.get("content-length") ?? 0);
        // On a 206 the length is the remaining bytes; add what we already have.
        total = res.status === 206 ? loaded + len : len;
      }

      if (!res.body) {
        chunks.push(new Uint8Array(await res.arrayBuffer()));
        loaded = chunks.reduce((n, c) => n + c.length, 0);
        break;
      }

      const reader = res.body.getReader();
      let streamDone = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }
        if (!value) continue;
        chunks.push(value);
        loaded += value.length;

        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        if (dt >= 0.25) {
          const inst = (loaded - lastLoaded) / dt;
          speed = speed === 0 ? inst : speed * 0.7 + inst * 0.3;
          lastTime = now;
          lastLoaded = loaded;
          updateDownloadProgress(id, loaded, total, speed);
        }
      }
      if (streamDone) break;
    } catch (err) {
      attempt += 1;
      if (attempt > maxRetries) {
        failDownload(id, err instanceof Error ? err.message : "Download failed");
        return;
      }
      // Brief backoff before resuming.
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  updateDownloadProgress(id, loaded, total || loaded, speed);
  saveBlob(new Blob(chunks as BlobPart[]), fileName);
  finishDownload(id);
}

/**
 * Multi-file download as a streamed ZIP built by the server. We read the
 * response as a stream so we can report progress (the ZIP is streamed, so
 * `total` is usually unknown → indeterminate progress with a live byte count).
 */
export async function downloadZip(ids: string[], label = "download.zip") {
  if (ids.length === 0) return;
  const id = startDownload(label);

  try {
    const res = await fetch("/api/download/zip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": await getCsrfToken(),
      },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      failDownload(id, json?.error ?? `ZIP failed (${res.status})`);
      return;
    }

    const total = Number(res.headers.get("content-length") ?? 0);
    const blob = await readStreamWithProgress(id, res, total);
    saveBlob(blob, label);
    finishDownload(id);
  } catch (err) {
    failDownload(id, err instanceof Error ? err.message : "ZIP download failed");
  }
}

/**
 * Read a fetch Response body to a Blob while reporting progress + smoothed
 * speed to the download store. Falls back to res.blob() if streaming is
 * unavailable.
 */
async function readStreamWithProgress(
  id: string,
  res: Response,
  total: number
): Promise<Blob> {
  if (!res.body) return res.blob();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  // Exponential moving average for a stable speed readout.
  let lastTime = performance.now();
  let lastLoaded = 0;
  let speed = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.length;

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    if (dt >= 0.25) {
      const inst = (loaded - lastLoaded) / dt;
      speed = speed === 0 ? inst : speed * 0.7 + inst * 0.3;
      lastTime = now;
      lastLoaded = loaded;
      updateDownloadProgress(id, loaded, total, speed);
    }
  }

  updateDownloadProgress(id, loaded, total || loaded, speed);
  return new Blob(chunks as BlobPart[]);
}
