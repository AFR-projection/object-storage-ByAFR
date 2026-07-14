"use client";

import { encryptFile, type EncryptionMetaV1 } from "@/lib/crypto/client-encryption";

export interface UploadItem {
  id: string;
  file: File;
  folderId: string | null;
  remotePath: string;
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  progress: number;
  speed: number;
  error?: string;
  fileId?: string;
  retries: number;
  encrypted?: boolean;
}

export interface UploadStats {
  total: number;
  completed: number;
  failed: number;
  active: number;
  queued: number;
  totalBytes: number;
  loadedBytes: number;
  overallProgress: number;
  speed: number;
  eta: number;
}

type UploadQueueEvents = {
  change: (items: UploadItem[], stats: UploadStats) => void;
  complete: (item: UploadItem) => void;
  error: (item: UploadItem, error: string) => void;
  allComplete: () => void;
};

const MAX_CONCURRENT = 6;
const MAX_RETRIES = 2;
const SPEED_SAMPLE_SIZE = 5;

let csrfToken: string | null = null;
async function getCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch("/api/auth/csrf");
  const json = await res.json();
  csrfToken = json.data.token;
  return csrfToken!;
}

async function apiPost<T>(url: string, body: Record<string, unknown>): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": await getCsrf() },
    body: JSON.stringify(body),
  });
  return res.json();
}

let counter = 0;
function uid(): string {
  return `up_${Date.now()}_${++counter}`;
}

export class UploadQueue {
  private items: UploadItem[] = [];
  private listeners: Partial<UploadQueueEvents> = {};
  private activeCount = 0;
  private paused = false;
  private speedSamples: number[] = [];
  private encryptEnabled = false;
  private encryptPassphrase: string | null = null;

  setEncryption(enabled: boolean, passphrase: string | null) {
    this.encryptEnabled = enabled;
    this.encryptPassphrase = passphrase;
  }

  on<K extends keyof UploadQueueEvents>(event: K, cb: UploadQueueEvents[K]) {
    this.listeners[event] = cb;
  }

  private emit(event: keyof UploadQueueEvents, ...args: unknown[]) {
    const cb = this.listeners[event] as ((...a: unknown[]) => void) | undefined;
    if (cb) cb(...args);
  }

  private notify() {
    this.emit("change", this.items, this.getStats());
  }

  getStats(): UploadStats {
    const total = this.items.length;
    const completed = this.items.filter((i) => i.status === "done").length;
    const failed = this.items.filter((i) => i.status === "error").length;
    const active = this.items.filter((i) => i.status === "uploading").length;
    const queued = this.items.filter((i) => i.status === "queued").length;
    const totalBytes = this.items.reduce((s, i) => s + i.file.size, 0);
    const loadedBytes = this.items.reduce((s, i) => s + (i.file.size * i.progress) / 100, 0);
    const overallProgress = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0;
    const speed = this.getCurrentSpeed();
    const remainingBytes = totalBytes - loadedBytes;
    const eta = speed > 0 ? remainingBytes / speed : 0;
    return { total, completed, failed, active, queued, totalBytes, loadedBytes, overallProgress, speed, eta };
  }

  private getCurrentSpeed(): number {
    if (this.speedSamples.length === 0) return 0;
    const sum = this.speedSamples.reduce((a, b) => a + b, 0);
    return sum / this.speedSamples.length;
  }

  addFiles(files: File[], baseFolderId: string | null = null, pathPrefix: string = "") {
    for (const file of files) {
      const remotePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
      this.items.push({
        id: uid(),
        file,
        folderId: baseFolderId,
        remotePath,
        status: "queued",
        progress: 0,
        speed: 0,
        retries: 0,
        encrypted: this.encryptEnabled,
      });
    }
    this.notify();
    this.processNext();
  }

  addFolderStructure(entries: { file: File; relativePath: string; folderId: string | null }[]) {
    for (const entry of entries) {
      this.items.push({
        id: uid(),
        file: entry.file,
        folderId: entry.folderId,
        remotePath: entry.relativePath,
        status: "queued",
        progress: 0,
        speed: 0,
        retries: 0,
        encrypted: this.encryptEnabled,
      });
    }
    this.notify();
    this.processNext();
  }

  private async processNext() {
    if (this.paused) return;
    while (this.activeCount < MAX_CONCURRENT) {
      let next: UploadItem | undefined;
      let nextIdx = -1;
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].status !== "queued") continue;
        if (!next || this.items[i].file.size < next.file.size) {
          next = this.items[i];
          nextIdx = i;
        }
      }
      if (!next) break;
      if (nextIdx > 0) {
        this.items.splice(nextIdx, 1);
        this.items.unshift(next);
      }
      this.activeCount++;
      this.uploadItem(next).finally(() => {
        this.activeCount--;
        this.processNext();
        if (this.getStats().active === 0 && this.getStats().queued === 0) {
          this.emit("allComplete");
        }
      });
    }
  }

  private async uploadItem(item: UploadItem) {
    item.status = "uploading";
    this.notify();

    try {
      const shouldEncrypt = !!(item.encrypted && this.encryptPassphrase);
      let uploadBlob: Blob = item.file;
      let uploadSize = item.file.size;
      let uploadMime = item.file.type || "application/octet-stream";
      let encryptionMeta: EncryptionMetaV1 | undefined;

      if (shouldEncrypt) {
        const encrypted = await encryptFile(item.file, this.encryptPassphrase!);
        uploadBlob = encrypted.blob;
        uploadSize = encrypted.sizeBytes;
        uploadMime = "application/octet-stream";
        encryptionMeta = encrypted.meta;
      }

      const presign = await apiPost<{ fileId: string; uploadUrl: string }>("/api/upload/presign", {
        filename: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        sizeBytes: uploadSize,
        folderId: item.folderId,
        encrypted: shouldEncrypt,
        encryptionMeta,
      });

      if (!presign.success || !presign.data) {
        throw new Error(presign.error ?? "Gagal mempersiapkan upload");
      }

      const { fileId, uploadUrl } = presign.data;
      item.fileId = fileId;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastLoaded = 0;
        let lastTime = Date.now();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            item.progress = Math.round((e.loaded / e.total) * 100);

            const now = Date.now();
            const dt = (now - lastTime) / 1000;
            if (dt > 0.3) {
              const bytesPerSec = (e.loaded - lastLoaded) / dt;
              item.speed = bytesPerSec;
              this.speedSamples.push(bytesPerSec);
              if (this.speedSamples.length > SPEED_SAMPLE_SIZE) this.speedSamples.shift();
              lastLoaded = e.loaded;
              lastTime = now;
            }
            this.notify();
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload gagal (HTTP ${xhr.status})`));
        });
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.addEventListener("abort", () => reject(new Error("Cancelled")));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", uploadMime);
        xhr.send(uploadBlob);

        (item as UploadItem & { _xhr?: XMLHttpRequest })._xhr = xhr;
      });

      const complete = await apiPost<{ fileId: string; name: string }>("/api/upload/complete", {
        fileId,
        encrypted: shouldEncrypt,
        encryptionMeta,
        originalMimeType: shouldEncrypt ? item.file.type || "application/octet-stream" : undefined,
      });
      if (!complete.success) {
        throw new Error(complete.error ?? "Upload tidak dapat diselesaikan");
      }

      item.status = "done";
      item.progress = 100;
      this.emit("complete", item);
      this.notify();
    } catch (err) {
      if ((item as UploadItem).status === "cancelled") return;

      if (item.retries < MAX_RETRIES) {
        item.retries++;
        item.status = "queued";
        item.progress = 0;
        this.notify();
        return;
      }

      item.status = "error";
      item.error = err instanceof Error ? err.message : "Upload failed";
      this.emit("error", item, item.error);
      this.notify();
    }
  }

  cancelItem(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "uploading") {
      const xhr = (item as UploadItem & { _xhr?: XMLHttpRequest })._xhr;
      if (xhr) xhr.abort();
      if (item.fileId) {
        apiPost("/api/upload/cancel", { fileId: item.fileId }).catch(() => {});
      }
    }
    item.status = "cancelled" as UploadItem["status"];
    this.notify();
  }

  cancelAll() {
    for (const item of this.items) {
      if (item.status === "queued" || item.status === "uploading") {
        this.cancelItem(item.id);
      }
    }
  }

  retryItem(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.status !== "error") return;
    item.status = "queued";
    item.progress = 0;
    item.error = undefined;
    item.retries = 0;
    this.notify();
    this.processNext();
  }

  retryFailed() {
    for (const item of this.items) {
      if (item.status === "error") {
        this.retryItem(item.id);
      }
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.processNext();
  }

  clearCompleted() {
    this.items = this.items.filter((i) => i.status !== "done" && i.status !== "cancelled");
    this.notify();
  }

  getItems(): UploadItem[] {
    return [...this.items];
  }
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatETA(seconds: number): string {
  if (seconds < 1) return "Almost done";
  if (seconds < 60) return `${Math.round(seconds)}s remaining`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s remaining`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m remaining`;
}

export async function traverseDirectory(entry: FileSystemEntry, path: string = ""): Promise<{ file: File; relativePath: string }[]> {
  const results: { file: File; relativePath: string }[] = [];

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    results.push({ file, relativePath: path ? `${path}/${file.name}` : file.name });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      const allEntries: FileSystemEntry[] = [];
      function readBatch() {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...batch);
            readBatch();
          }
        });
      }
      readBatch();
    });

    for (const child of entries) {
      const childPath = path ? `${path}/${child.name}` : child.name;
      const childResults = await traverseDirectory(child, childPath);
      results.push(...childResults);
    }
  }

  return results;
}
