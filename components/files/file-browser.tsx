"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, FolderPlus, FilePlus, Grid3X3, List, Search, Loader2, Trash2, AlertCircle, FolderUp,
  Image, Film, Music, FileText, FileArchive, Star, X, CheckSquare, Square,
  Download, File, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileGrid } from "./file-grid";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { File as FileRecord, Folder as FolderRecord } from "@/lib/db/schema";
import dynamic from "next/dynamic";
import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { FolderCard } from "@/components/folders/folder-card";
import { UploadQueue, traverseDirectory } from "@/lib/upload-queue";
import { motion, AnimatePresence } from "framer-motion";

const NoteEditor = dynamic(() => import("@/components/editors/note-editor").then((m) => m.NoteEditor), { ssr: false });
const FilePreview = dynamic(() => import("@/components/files/file-preview").then((m) => m.FilePreview), { ssr: false });
const UploadPanel = dynamic(() => import("@/components/files/upload-panel").then((m) => m.UploadPanel), { ssr: false });
const FolderInviteDialog = dynamic(
  () => import("@/components/folders/folder-invite-dialog").then((m) => m.FolderInviteDialog),
  { ssr: false }
);

// ─── Filter definitions ─────────────────────────────────────────────────────
const FILTERS = [
  { key: "all", label: "All", icon: File },
  { key: "image", label: "Images", icon: Image },
  { key: "video", label: "Videos", icon: Film },
  { key: "audio", label: "Audio", icon: Music },
  { key: "document", label: "Documents", icon: FileText },
  { key: "archive", label: "Archives", icon: FileArchive },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const FILTER_MIME_MAP: Record<string, string[]> = {
  image: ["image/"],
  video: ["video/"],
  audio: ["audio/"],
  document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument", "text/", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"],
  archive: ["application/zip", "application/x-rar", "application/x-7z", "application/gzip", "application/x-tar"],
};

function matchesFilter(file: FileRecord, filter: FilterKey): boolean {
  if (filter === "all") return true;
  const prefixes = FILTER_MIME_MAP[filter] ?? [];
  return prefixes.some((p) => file.mimeType.startsWith(p));
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface FileBrowserProps {
  folderId?: string | null;
  trash?: boolean;
  favorites?: boolean;
  selectedFileId?: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FileBrowser({ folderId = null, trash = false, favorites = false, selectedFileId = null }: FileBrowserProps) {
  const queryClient = useQueryClient();

  // View + search + filter + sort
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // File preview / note editor
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  // Upload
  const [error, setError] = useState("");
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueue | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [encryptUploads, setEncryptUploads] = useState(false);
  const [encryptPassphrase, setEncryptPassphrase] = useState("");
  const [inviteFolder, setInviteFolder] = useState<FolderRecord | null>(null);

  // Infinite scroll — extra pages loaded via "Load more"
  const [loadedMore, setLoadedMore] = useState<FileRecord[]>([]);
  /** undefined = use first page cursor; null/string = after load-more */
  const [moreCursor, setMoreCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const listScope = `${folderId ?? "root"}:${trash}:${favorites}:${search}`;

  // ── File fetching ──
  const filesQuery = useQuery({
    queryKey: ["files", folderId, trash, favorites, search],
    queryFn: async () => {
      if (search) {
        const params = new URLSearchParams({ q: search, limit: "100" });
        if (folderId) params.set("folderId", folderId);
        const res = await apiFetch<{ files: FileRecord[]; nextCursor: string | null }>(
          `/api/search?${params}`
        );
        if (!res.success) throw new Error(res.error ?? "Failed to search files");
        return res.data ?? { files: [], nextCursor: null };
      }
      const params = new URLSearchParams({ limit: "100" });
      if (folderId) params.set("folderId", folderId);
      if (trash) params.set("trash", "true");
      if (favorites) params.set("favorites", "true");
      const res = await apiFetch<{ files: FileRecord[]; nextCursor: string | null }>(
        `/api/files?${params}`
      );
      if (!res.success) throw new Error(res.error ?? "Failed to load files");
      return res.data ?? { files: [], nextCursor: null };
    },
    staleTime: 5_000,
    refetchOnMount: "always",
    retry: 2,
  });

  // Reset pagination when folder / filters change
  useEffect(() => {
    setLoadedMore([]);
    setMoreCursor(undefined);
  }, [listScope]);

  const baseFiles = filesQuery.data?.files ?? [];
  const allFiles = useMemo(() => {
    if (loadedMore.length === 0) return baseFiles;
    const seen = new Set(baseFiles.map((f) => f.id));
    const merged = [...baseFiles];
    for (const f of loadedMore) {
      if (!seen.has(f.id)) merged.push(f);
    }
    return merged;
  }, [baseFiles, loadedMore]);

  const nextCursor =
    moreCursor !== undefined ? moreCursor : (filesQuery.data?.nextCursor ?? null);

  const getQueue = useCallback((): UploadQueue => {
    if (!uploadQueue) {
      const q = new UploadQueue();
      q.setEncryption(encryptUploads, encryptUploads ? encryptPassphrase : null);
      q.on("change", (items, stats) => {
        if (stats.total > 0) setShowUploadPanel(true);
      });
      q.on("allComplete", () => {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["folders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });
      setUploadQueue(q);
      return q;
    }
    uploadQueue.setEncryption(encryptUploads, encryptUploads ? encryptPassphrase : null);
    return uploadQueue;
  }, [uploadQueue, queryClient, encryptUploads, encryptPassphrase]);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  }, []);

  // ── Folder fetching ──
  const foldersQuery = useQuery({
    queryKey: ["folders", folderId, trash],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.set("parentId", folderId);
      if (trash) params.set("trash", "true");
      const res = await apiFetch<{ folders: FolderRecord[] }>(`/api/folders?${params}`);
      return res.data?.folders ?? [];
    },
    enabled: !favorites && !search,
  });

  const folders = foldersQuery.data ?? [];

  // ── Load more ──
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "100", cursor: nextCursor });
      if (folderId) params.set("folderId", folderId);
      if (trash) params.set("trash", "true");
      if (favorites) params.set("favorites", "true");
      const res = await apiFetch<{ files: FileRecord[]; nextCursor: string | null }>(
        `/api/files?${params}`
      );
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Failed to load more files");
      }
      setLoadedMore((prev) => [...prev, ...res.data!.files]);
      setMoreCursor(res.data.nextCursor);
    } catch {
      showError("Failed to load more files");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, folderId, trash, favorites, showError]);

  // ── Filter + sort files (client-side) ──
  const filteredFiles = useMemo(() => {
    let list = allFiles;
    if (typeFilter !== "all") {
      list = list.filter((f) => matchesFilter(f, typeFilter));
    }
    return list;
  }, [allFiles, typeFilter]);

  // ── Dropzone ──
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const queue = getQueue();
      queue.addFiles(acceptedFiles, folderId);
    },
    [folderId, getQueue]
  );

  const onDropNative = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const items = e.dataTransfer.items;
      if (!items) return;

      const queue = getQueue();
      const allFilesArr: { file: File; relativePath: string; folderId: string | null }[] = [];

      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      for (const entry of entries) {
        if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry;
          const files = await traverseDirectory(entry, dirEntry.name);
          for (const f of files) {
            allFilesArr.push({ file: f.file, relativePath: f.relativePath, folderId: null });
          }
        } else {
          const fileEntry = entry as FileSystemFileEntry;
          const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
          allFilesArr.push({ file, relativePath: file.name, folderId });
        }
      }

      // Extract ALL unique directory paths from all traversed files
      const allFolderPaths = new Set<string>();
      for (const item of allFilesArr) {
        const parts = item.relativePath.split("/");
        if (parts.length > 1) {
          for (let i = 1; i < parts.length; i++) {
            allFolderPaths.add(parts.slice(0, i).join("/"));
          }
        }
      }

      if (allFolderPaths.size > 0) {
        try {
          const res = await apiFetch<{ folders: Record<string, string> }>("/api/folders/batch", {
            method: "POST",
            body: JSON.stringify({ paths: Array.from(allFolderPaths) }),
          });
          if (res.data?.folders) {
            for (const item of allFilesArr) {
              const parts = item.relativePath.split("/");
              if (parts.length > 1) {
                const folderPath = parts.slice(0, -1).join("/");
                item.folderId = res.data.folders[folderPath] ?? folderId;
              } else {
                item.folderId = folderId;
              }
            }
          }
        } catch {
          showError("Failed to create folders");
          return;
        }
      }

      queue.addFolderStructure(allFilesArr);
    },
    [folderId, getQueue]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  // ── File actions ──
  const handleFileAction = useCallback(async (action: string, file: FileRecord) => {
    try {
      if (action === "download") {
        window.open(`/api/download/${file.id}`, "_blank");
        return;
      }
      if (trash) {
        if (action === "restore") {
          const res = await apiFetch("/api/files", { method: "PATCH", body: JSON.stringify({ id: file.id, action: "restore" }) });
          if (!res.success) { showError(res.error ?? "Failed to restore"); return; }
        } else if (action === "delete") {
          const res = await apiFetch("/api/files", { method: "DELETE", body: JSON.stringify({ id: file.id, permanent: true }) });
          if (!res.success) { showError(res.error ?? "Failed to delete permanently"); return; }
        }
        queryClient.invalidateQueries({ queryKey: ["files"] });
        return;
      }
      if (action === "delete") {
        const res = await apiFetch("/api/files", { method: "PATCH", body: JSON.stringify({ id: file.id, action: "delete" }) });
        if (!res.success) { showError(res.error ?? "Failed to delete"); return; }
      } else if (action === "favorite") {
        const res = await apiFetch("/api/files", { method: "PATCH", body: JSON.stringify({ id: file.id, action: "favorite" }) });
        if (!res.success) { showError(res.error ?? "Failed"); return; }
      } else if (action === "rename") {
        const name = prompt("Rename file:", file.name);
        if (!name) return;
        const res = await apiFetch("/api/files", { method: "PATCH", body: JSON.stringify({ id: file.id, action: "rename", name }) });
        if (!res.success) { showError(res.error ?? "Failed to rename"); return; }
      } else {
        const res = await apiFetch("/api/files", { method: "PATCH", body: JSON.stringify({ id: file.id, action }) });
        if (!res.success) { showError(res.error ?? "Failed"); return; }
      }
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      showError("Connection failed");
    }
  }, [trash, queryClient, showError]);

  // ── Folder actions ──
  async function createFolder() {
    const name = prompt("Folder name:");
    if (!name) return;
    try {
      const res = await apiFetch("/api/folders", { method: "POST", body: JSON.stringify({ name, parentId: folderId }) });
      if (!res.success) { showError(res.error ?? "Failed to create folder"); return; }
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    } catch {
      showError("Connection failed");
    }
  }

  async function folderAction(action: "rename" | "delete", folder: FolderRecord) {
    try {
      if (action === "rename") {
        const name = prompt("New folder name:", folder.name);
        if (!name) return;
        const res = await apiFetch("/api/folders", { method: "PATCH", body: JSON.stringify({ id: folder.id, action: "rename", name }) });
        if (!res.success) { showError(res.error ?? "Failed to rename"); return; }
      } else if (action === "delete") {
        if (!confirm(`Delete "${folder.name}" and all its contents?`)) return;
        const res = await apiFetch("/api/folders", { method: "PATCH", body: JSON.stringify({ id: folder.id, action: "delete" }) });
        if (!res.success) { showError(res.error ?? "Failed to delete"); return; }
      }
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      showError("Connection failed");
    }
  }

  // ── Note ──
  async function createNote() {
    const res = await apiFetch<{ file: FileRecord }>("/api/files", { method: "POST", body: JSON.stringify({ name: "Untitled Note", folderId }) });
    if (res.data?.file) {
      setSelectedFile(res.data.file);
      setShowNoteEditor(true);
      queryClient.invalidateQueries({ queryKey: ["files"] });
    }
  }

  // ── Drag-drop ──
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    try {
      const res = await apiFetch("/api/files", { method: "PATCH", body: JSON.stringify({ id: active.id as string, action: "move", folderId: over.id as string }) });
      if (!res.success) { showError(res.error ?? "Failed to move"); return; }
      queryClient.invalidateQueries({ queryKey: ["files"] });
    } catch {
      showError("Connection failed");
    }
  }

  // ── Recursive directory reader for showDirectoryPicker ──
  async function readDirectoryRecursive(
    dirHandle: FileSystemDirectoryHandle,
    path: string = ""
  ): Promise<{ file: File; relativePath: string }[]> {
    const results: { file: File; relativePath: string }[] = [];
    for await (const [name, handle] of (dirHandle as any).entries()) {
      const entryPath = path ? `${path}/${name}` : name;
      if (handle.kind === "file") {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        results.push({ file, relativePath: entryPath });
      } else {
        const subResults = await readDirectoryRecursive(handle as FileSystemDirectoryHandle, entryPath);
        results.push(...subResults);
      }
    }
    return results;
  }

  // ── Folder upload (showDirectoryPicker + webkitdirectory fallback) ──
  async function pickAndUploadFolder() {
    let rootFolderName: string;
    let files: { file: File; relativePath: string }[];

    // Try modern File System Access API first
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        rootFolderName = dirHandle.name;
        files = await readDirectoryRecursive(dirHandle);
      } catch (err: any) {
        if (err?.name === "AbortError") return; // User cancelled
        showError("Failed to read folder");
        return;
      }
    } else {
      // Fallback: trigger hidden webkitdirectory input
      folderInputRef.current?.click();
      return;
    }

    if (files.length === 0) return;
    await uploadFolderStructure(rootFolderName, files, folderId);
  }

  // ── Webkitdirectory fallback handler ──
  async function handleFolderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const entries = Array.from(fileList) as any[];
    const files: { file: File; relativePath: string }[] = [];

    for (const f of entries) {
      const path = f.webkitRelativePath || f.name;
      files.push({ file: f, relativePath: path });
    }

    // Use timestamp as folder name since webkitdirectory doesn't expose the original name
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}.${String(now.getMinutes()).padStart(2, "0")}`;
    const fallbackName = `Upload ${ts}`;

    await uploadFolderStructure(fallbackName, files, folderId);
    e.target.value = "";
  }

  // ── Core: create root folder, subfolders, then upload all files ──
  async function uploadFolderStructure(
    rootName: string,
    files: { file: File; relativePath: string }[],
    parentFolderId: string | null,
  ) {
    if (files.length === 0) return;
    const queue = getQueue();

    // 1. Create the root folder
    const folderRes = await apiFetch<{ folder: FolderRecord }>("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name: rootName, parentId: parentFolderId }),
    });
    if (!folderRes.success || !folderRes.data) {
      showError("Failed to create folder");
      return;
    }
    const rootId = folderRes.data.folder.id;

    // 2. Collect all unique subfolder paths (relative to root folder)
    const subFolderPaths = new Set<string>();
    for (const item of files) {
      const parts = item.relativePath.split("/");
      if (parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
          subFolderPaths.add(parts.slice(0, i).join("/"));
        }
      }
    }

    // 3. Create subfolders inside root folder via batch API
    const folderIdMap = new Map<string, string>();
    if (subFolderPaths.size > 0) {
      try {
        const batchRes = await apiFetch<{ folders: Record<string, string> }>("/api/folders/batch", {
          method: "POST",
          body: JSON.stringify({
            paths: Array.from(subFolderPaths),
            rootFolderId: rootId,
          }),
        });
        if (batchRes.data?.folders) {
          for (const [path, id] of Object.entries(batchRes.data.folders)) {
            folderIdMap.set(path, id);
          }
        }
      } catch {
        showError("Failed to create subfolders");
        return;
      }
    }

    // 4. Prepare files with correct folderId
    const uploadItems: { file: File; relativePath: string; folderId: string | null }[] = [];
    for (const item of files) {
      const parts = item.relativePath.split("/");
      if (parts.length > 1) {
        const folderPath = parts.slice(0, -1).join("/");
        const destFolderId = folderIdMap.get(folderPath) ?? rootId;
        uploadItems.push({ file: item.file, relativePath: item.relativePath, folderId: destFolderId });
      } else {
        // File at root of uploaded folder → goes directly into root folder
        uploadItems.push({ file: item.file, relativePath: item.relativePath, folderId: rootId });
      }
    }

    // 5. Upload all files
    queue.addFolderStructure(uploadItems);
  }

  // ── Sort toggle ──
  const handleSort = useCallback((key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  }, [sortBy]);

  // ── Selection ──
  const toggleSelect = useCallback((id: string, _shiftKey?: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredFiles.length) return new Set();
      return new Set(filteredFiles.map((f) => f.id));
    });
  }, [filteredFiles]);

  // ── Batch actions ──
  async function batchFavorite() {
    const ids = Array.from(selectedIds);
    const res = await apiFetch("/api/files/batch", {
      method: "PATCH",
      body: JSON.stringify({ ids, action: "favorite" }),
    });
    if (!res.success) showError(res.error ?? "Favorite failed");
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["files"] });
  }

  async function batchDelete() {
    if (!confirm(`Delete ${selectedIds.size} file${selectedIds.size > 1 ? "s" : ""}?`)) return;
    const ids = Array.from(selectedIds);
    const res = await apiFetch("/api/files/batch", {
      method: "PATCH",
      body: JSON.stringify({ ids, action: "delete" }),
    });
    if (!res.success) showError(res.error ?? "Delete failed");
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function batchDownload() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (ids.length === 1) {
      window.open(`/api/download/${ids[0]}`, "_blank");
      return;
    }

    try {
      const { getCsrfToken } = await import("@/lib/api/client");
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
        showError(json?.error ?? "ZIP download failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "download.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showError("ZIP download failed");
    }
  }

  // ── Select file from URL ──
  useEffect(() => {
    if (selectedFileId && allFiles.length > 0) {
      const found = allFiles.find((f) => f.id === selectedFileId);
      if (found) {
        setSelectedFile(found);
        if (found.isNote) setShowNoteEditor(true);
      }
    }
  }, [selectedFileId, allFiles]);

  const handleFileClick = useCallback((file: FileRecord) => {
    if (file.isNote) { setSelectedFile(file); setShowNoteEditor(true); }
    else { setSelectedFile(file); }
  }, []);

  const isLoading = filesQuery.isPending && !filesQuery.data;

  useEffect(() => {
    if (filesQuery.isError) {
      showError(filesQuery.error instanceof Error ? filesQuery.error.message : "Failed to load files");
    }
  }, [filesQuery.isError, filesQuery.error, showError]);

  return (
    <DndContext onDragEnd={handleDragEnd}>
    <div
      {...getRootProps()}
      className="relative"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={onDropNative}
    >
      <input {...getInputProps()} />

      {/* ── Drag overlay ── */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/5 backdrop-blur-sm">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Upload className="h-10 w-10 text-accent" />
              <FolderUp className="h-10 w-10 text-accent/60" />
            </div>
            <p className="text-lg font-medium">Drop files or folders to upload</p>
            <p className="text-sm text-muted-foreground mt-1">Files and folder structures will be preserved</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-start sm:items-center gap-3">
        <div className="relative flex-1 min-w-[160px] sm:min-w-[200px] max-w-md w-full sm:w-auto order-1 sm:order-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 sm:h-10"
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 order-2 sm:order-none flex-wrap">
          <Button variant="secondary" size="sm" onClick={createFolder} disabled={trash || favorites} className="h-9 px-2 sm:px-3">
            <FolderPlus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Folder</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={createNote} disabled={trash || favorites} className="h-9 px-2 sm:px-3">
            <FilePlus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Note</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={pickAndUploadFolder} disabled={trash || favorites} className="h-9 px-2 sm:px-3">
            <FolderUp className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Upload Folder</span>
          </Button>
          <Button
            variant={encryptUploads ? "default" : "secondary"}
            size="sm"
            disabled={trash || favorites}
            className="h-9 px-2 sm:px-3"
            title="Encrypt uploads client-side (AES-GCM)"
            onClick={() => {
              if (encryptUploads) {
                setEncryptUploads(false);
                setEncryptPassphrase("");
                return;
              }
              const pass = prompt("Encryption passphrase for uploads:");
              if (!pass) return;
              setEncryptPassphrase(pass);
              setEncryptUploads(true);
            }}
          >
            <Lock className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">{encryptUploads ? "Encrypt On" : "Encrypt"}</span>
          </Button>
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error — webkitdirectory is non-standard HTML attribute
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleFolderUpload}
          />
          {trash ? (
            <Button variant="default" size="sm" disabled className="h-9 px-2 sm:px-3 opacity-40 cursor-not-allowed">
              <span className="flex items-center gap-1.5">
                <Upload className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Upload Files</span>
              </span>
            </Button>
          ) : (
            <label>
              <Button variant="default" size="sm" asChild className="h-9 px-2 sm:px-3">
                <span>
                  <Upload className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Upload Files</span>
                </span>
              </Button>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fileList = e.target.files;
                  if (!fileList) return;
                  const queue = getQueue();
                  queue.addFiles(Array.from(fileList), folderId);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          {/* View toggle */}
          <div className="flex items-center border border-border/40 rounded-lg overflow-hidden ml-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "rounded-none h-8 w-8",
                view === "grid" ? "bg-accent/10 text-accent" : ""
              )}
              onClick={() => setView("grid")}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "rounded-none h-8 w-8",
                view === "list" ? "bg-accent/10 text-accent" : ""
              )}
              onClick={() => setView("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter chips ── */}
      {!trash && !favorites && !search && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTypeFilter(key); setSelectedIds(new Set()); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
                typeFilter === key
                  ? "bg-accent text-white border-accent shadow-sm"
                  : "bg-surface text-muted-foreground/70 border-border/50 hover:border-accent/30 hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
              {key !== "all" && (
                <span className="ml-0.5 opacity-60">
                  {allFiles.filter((f) => matchesFilter(f, key)).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── File count ── */}
      {!isLoading && allFiles.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground/50">
          {typeFilter !== "all"
            ? `${filteredFiles.length} of ${allFiles.length} files`
            : `${allFiles.length} file${allFiles.length !== 1 ? "s" : ""}`
          }
        </p>
      )}

      {/* ── Batch action bar ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-3"
          >
            <span className="text-sm font-medium shrink-0">{selectedIds.size} selected</span>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={toggleSelectAll}>
              {selectedIds.size === filteredFiles.length ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {selectedIds.size === filteredFiles.length ? "Deselect all" : "Select all"}
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={batchDownload}>
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={batchFavorite}>
              <Star className="h-3.5 w-3.5" />
              Favorite
            </Button>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={batchDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Folders ── */}
      {!search && folders.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              trash={trash}
              onRename={(f) => folderAction("rename", f)}
              onDelete={(f) => folderAction("delete", f)}
              onShare={trash ? undefined : (f) => setInviteFolder(f)}
            />
          ))}
        </div>
      )}

      {/* ── Files ── */}
      <FileGrid
        files={filteredFiles}
        view={view}
        trash={trash}
        selectedIds={selectedIds}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onFileAction={handleFileAction}
        onFileClick={handleFileClick}
        onSelect={toggleSelect}
        onSelectAll={toggleSelectAll}
        onSort={handleSort}
        hasMore={!!nextCursor}
        loadMore={loadMore}
        loadingMore={loadingMore}
      />

      {/* ── Preview / Note editor ── */}
      {selectedFile && !showNoteEditor && (
        <FilePreview file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}

      {showNoteEditor && selectedFile && (
        <NoteEditor file={selectedFile} onClose={() => { setShowNoteEditor(false); setSelectedFile(null); }} />
      )}

      {inviteFolder && (
        <FolderInviteDialog
          folderId={inviteFolder.id}
          folderName={inviteFolder.name}
          onClose={() => setInviteFolder(null)}
        />
      )}
    </div>

    {showUploadPanel && uploadQueue && (
      <AnimatePresence mode="wait">
        <UploadPanel key="upload-panel" queue={uploadQueue} onDismiss={() => setShowUploadPanel(false)} />
      </AnimatePresence>
    )}
    </DndContext>
  );
}
