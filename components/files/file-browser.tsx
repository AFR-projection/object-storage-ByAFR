"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { QUICK_ACTION_EVENT, type QuickAction } from "@/lib/system/quick-actions";
import { useDropzone } from "react-dropzone";
import {
  Upload, FolderPlus, FilePlus, Grid3X3, List, Search, Trash2, AlertCircle, FolderUp,
  Image, Film, Music, FileText, FileArchive, Star, X, CheckSquare, Square,
  Download, File, Lock, Move, ArrowDownUp, ArrowUp, ArrowDown, Check, PencilRuler,
  Copy, Scissors, ClipboardPaste,
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
import { requestDownload, downloadZip } from "@/lib/download/download-actions";
import { EncryptionSetupDialog } from "./encryption-setup-dialog";
import { MoveToFolderDialog } from "./move-to-folder-dialog";
import { BulkRenameDialog } from "./bulk-rename-dialog";
import { useDialogs } from "@/components/ui/dialog-prompts";
import {
  loadView, saveView, loadSortBy, saveSortBy, loadSortOrder, saveSortOrder,
  SORT_OPTIONS,
} from "@/lib/files/view-prefs";
import { sortFiles } from "@/lib/files/sort";
import {
  setClipboard, clearClipboard, getClipboard, useFileClipboard,
} from "@/lib/files/clipboard";
import { notify } from "@/lib/system/notify-store";
import { motion, AnimatePresence } from "framer-motion";

const NoteEditor = dynamic(() => import("@/components/editors/note-editor").then((m) => m.NoteEditor), { ssr: false });
const FilePreview = dynamic(() => import("@/components/files/file-preview").then((m) => m.FilePreview), { ssr: false });
const UploadPanel = dynamic(() => import("@/components/files/upload-panel").then((m) => m.UploadPanel), { ssr: false });
const ShareDialog = dynamic(() => import("@/components/files/share-dialog").then((m) => m.ShareDialog), { ssr: false });
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
  const { askPrompt, askConfirm, dialogs } = useDialogs();

  // View + search + filter + sort (view & sort persist across sessions)
  const [view, setView] = useState<"grid" | "list">(() => loadView());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<string>(() => loadSortBy());
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => loadSortOrder());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const setViewPersisted = useCallback((v: "grid" | "list") => {
    setView(v);
    saveView(v);
  }, []);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Move-to-folder dialog: holds the file ids being moved (null = closed)
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  // Bulk-rename dialog: holds the files being renamed (null = closed)
  const [bulkRenameIds, setBulkRenameIds] = useState<string[] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clipboard = useFileClipboard();

  // File preview / note editor
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  // Upload
  const [error, setError] = useState("");
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueue | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [encryptUploads, setEncryptUploads] = useState(false);
  const [encryptPassphrase, setEncryptPassphrase] = useState("");
  const [encryptDialogOpen, setEncryptDialogOpen] = useState(false);
  const [inviteFolder, setInviteFolder] = useState<FolderRecord | null>(null);
  const [shareFile, setShareFile] = useState<FileRecord | null>(null);

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

  // ── Clipboard: copy / cut (paste lives below, needs folderId handlers) ──
  const copyToClipboard = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const label = ids.length === 1
      ? (allFiles.find((x) => x.id === ids[0])?.name ?? "1 file")
      : `${ids.length} files`;
    setClipboard("copy", ids, label);
    notify({ title: "Copied", description: `${label} ready to paste`, tone: "info", duration: 2500 });
  }, [allFiles]);

  const cutToClipboard = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const label = ids.length === 1
      ? (allFiles.find((x) => x.id === ids[0])?.name ?? "1 file")
      : `${ids.length} files`;
    setClipboard("cut", ids, label);
    notify({ title: "Cut", description: `${label} ready to move`, tone: "info", duration: 2500 });
  }, [allFiles]);

  // ── File actions ──
  const handleFileAction = useCallback(async (action: string, file: FileRecord) => {
    try {
      if (action === "download") {
        // Notes have no stored file — export happens from the editor
        // (Markdown / TXT / PDF). Open it instead of hitting the download API.
        if (file.isNote) {
          setSelectedFile(file);
          setShowNoteEditor(true);
          return;
        }
        requestDownload(file);
        return;
      }
      if (action === "share") {
        // Open the share dialog — "share" is not a PATCH mutation.
        setShareFile(file);
        return;
      }
      if (action === "move") {
        setMoveIds([file.id]);
        return;
      }
      if (action === "clip-copy") {
        copyToClipboard(selectedIds.has(file.id) ? Array.from(selectedIds) : [file.id]);
        return;
      }
      if (action === "clip-cut") {
        cutToClipboard(selectedIds.has(file.id) ? Array.from(selectedIds) : [file.id]);
        return;
      }
      if (trash) {
        if (action === "restore") {
          const res = await apiFetch("/api/files", { method: "PATCH", body: JSON.stringify({ id: file.id, action: "restore" }) });
          if (!res.success) { showError(res.error ?? "Failed to restore"); return; }
        } else if (action === "delete") {
          const ok = await askConfirm({
            title: "Delete permanently?",
            message: `"${file.name}" will be erased forever. This cannot be undone.`,
            confirmText: "Delete forever",
            danger: true,
          });
          if (!ok) return;
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
        const name = await askPrompt({
          title: "Rename file",
          label: "File name",
          initialValue: file.name,
          confirmText: "Rename",
          selectStem: true,
        });
        if (!name || name === file.name) return;
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
  }, [trash, queryClient, showError, askPrompt, askConfirm, copyToClipboard, cutToClipboard, selectedIds]);

  // ── Folder actions ──
  async function createFolder() {
    const name = await askPrompt({
      title: "New folder",
      label: "Folder name",
      placeholder: "Untitled folder",
      confirmText: "Create",
    });
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
        const name = await askPrompt({
          title: "Rename folder",
          label: "Folder name",
          initialValue: folder.name,
          confirmText: "Rename",
        });
        if (!name || name === folder.name) return;
        const res = await apiFetch("/api/folders", { method: "PATCH", body: JSON.stringify({ id: folder.id, action: "rename", name }) });
        if (!res.success) { showError(res.error ?? "Failed to rename"); return; }
      } else if (action === "delete") {
        const ok = await askConfirm({
          title: "Delete folder?",
          message: `"${folder.name}" and everything inside it will be moved to the recycle bin.`,
          confirmText: "Delete folder",
          danger: true,
        });
        if (!ok) return;
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
    const dirEntries = (
      dirHandle as unknown as {
        entries(): AsyncIterable<[string, FileSystemHandle]>;
      }
    ).entries();
    for await (const [name, handle] of dirEntries) {
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
        const dirHandle = await (
          window as unknown as {
            showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
          }
        ).showDirectoryPicker();
        rootFolderName = dirHandle.name;
        files = await readDirectoryRecursive(dirHandle);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return; // User cancelled
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

    const entries = Array.from(fileList);
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
      setSortOrder((o) => {
        const next = o === "asc" ? "desc" : "asc";
        saveSortOrder(next);
        return next;
      });
    } else {
      setSortBy(key);
      saveSortBy(key);
      setSortOrder("asc");
      saveSortOrder("asc");
    }
  }, [sortBy]);

  const chooseSort = useCallback((key: string) => {
    setSortBy(key);
    saveSortBy(key);
    setSortMenuOpen(false);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((o) => {
      const next = o === "asc" ? "desc" : "asc";
      saveSortOrder(next);
      return next;
    });
  }, []);

  // ── Selection ──
  // Files in the exact order the user sees them (filter + sort) — the basis for
  // shift-click range selection so a range matches the on-screen order.
  const visibleFiles = useMemo(
    () => sortFiles(filteredFiles, sortBy, sortOrder),
    [filteredFiles, sortBy, sortOrder]
  );
  const lastSelectedId = useRef<string | null>(null);

  const toggleSelect = useCallback((id: string, shiftKey?: boolean) => {
    // Shift-click: select the contiguous range from the last anchor to here.
    if (shiftKey && lastSelectedId.current) {
      const order = visibleFiles.map((f) => f.id);
      const from = order.indexOf(lastSelectedId.current);
      const to = order.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        const range = order.slice(lo, hi + 1);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const rid of range) next.add(rid);
          return next;
        });
        lastSelectedId.current = id;
        return;
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastSelectedId.current = id;
  }, [visibleFiles]);

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
    const ok = await askConfirm({
      title: `Delete ${selectedIds.size} file${selectedIds.size > 1 ? "s" : ""}?`,
      message: "They'll be moved to the recycle bin — you can restore them later.",
      confirmText: "Move to trash",
      danger: true,
    });
    if (!ok) return;
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

  // Move one or many files into a destination folder (null = root).
  async function executeMove(ids: string[], destinationFolderId: string | null) {
    setMoveIds(null);
    if (ids.length === 0) return;
    try {
      if (ids.length === 1) {
        const res = await apiFetch("/api/files", {
          method: "PATCH",
          body: JSON.stringify({ id: ids[0], action: "move", folderId: destinationFolderId }),
        });
        if (!res.success) { showError(res.error ?? "Failed to move"); return; }
      } else {
        const res = await apiFetch("/api/files/batch", {
          method: "PATCH",
          body: JSON.stringify({ ids, action: "move", folderId: destinationFolderId }),
        });
        if (!res.success) { showError(res.error ?? "Failed to move files"); return; }
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      showError("Connection failed");
    }
  }

  // Apply a set of computed renames (from the bulk-rename dialog).
  async function executeBulkRename(renames: { id: string; name: string }[]) {
    setBulkRenameIds(null);
    if (renames.length === 0) return;
    let failed = 0;
    for (const r of renames) {
      try {
        const res = await apiFetch("/api/files", {
          method: "PATCH",
          body: JSON.stringify({ id: r.id, action: "rename", name: r.name }),
        });
        if (!res.success) failed++;
      } catch {
        failed++;
      }
    }
    if (failed > 0) showError(`${failed} file${failed > 1 ? "s" : ""} could not be renamed`);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["files"] });
  }

  // Paste = copy or move the clipboard contents INTO the current folder.
  async function pasteHere() {
    const clip = getClipboard();
    if (!clip) return;
    try {
      if (clip.mode === "cut") {
        const res = await apiFetch("/api/files/batch", {
          method: "PATCH",
          body: JSON.stringify({ ids: clip.ids, action: "move", folderId }),
        });
        if (!res.success) { showError(res.error ?? "Failed to move"); return; }
      } else {
        // Copy: duplicate each file into this folder (server copies the R2 object).
        let failed = 0;
        for (const id of clip.ids) {
          const res = await apiFetch("/api/files", {
            method: "PATCH",
            body: JSON.stringify({ id, action: "copy", targetFolderId: folderId }),
          });
          if (!res.success) failed++;
        }
        if (failed > 0) showError(`${failed} file${failed > 1 ? "s" : ""} could not be copied`);
      }
      // A cut is consumed on paste; a copy stays so it can be pasted again.
      if (clip.mode === "cut") clearClipboard();
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      notify({ title: "Pasted", description: `into ${folderId ? "this folder" : "My Files"}`, tone: "success", duration: 2500 });
    } catch {
      showError("Connection failed");
    }
  }

  async function batchDownload() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (ids.length === 1) {
      const file = allFiles.find((f) => f.id === ids[0]);
      if (file) {
        requestDownload(file);
      } else {
        downloadZip(ids, `download-1-file.zip`);
      }
      return;
    }
    // A ZIP is built server-side and cannot decrypt E2E-encrypted files, so any
    // encrypted selection would land in the archive as ciphertext. Block that:
    // steer the user to download encrypted files one-by-one (passphrase gated).
    const encryptedSelected = ids
      .map((id) => allFiles.find((f) => f.id === id))
      .filter((f): f is FileRecord => !!f && !!f.encrypted);
    if (encryptedSelected.length > 0) {
      showError(
        `${encryptedSelected.length} file terenkripsi tidak bisa masuk ZIP. Download satu per satu biar bisa dimasukin passphrase.`
      );
      return;
    }
    await downloadZip(ids, `download-${ids.length}-files.zip`);
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

  // Mobile bottom-nav "+" delegates here so we never duplicate upload/note/
  // folder logic. Disabled in trash/favorites where creation isn't allowed.
  useEffect(() => {
    if (trash || favorites) return;
    const handler = (e: Event) => {
      const action = (e as CustomEvent<QuickAction>).detail;
      if (action === "upload") uploadInputRef.current?.click();
      else if (action === "note") void createNote();
      else if (action === "folder") void createFolder();
    };
    window.addEventListener(QUICK_ACTION_EVENT, handler);
    return () => window.removeEventListener(QUICK_ACTION_EVENT, handler);
    // createNote/createFolder are stable closures over folderId; re-bind on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trash, favorites, folderId]);

  const isLoading = filesQuery.isPending && !filesQuery.data;

  // ── Keyboard shortcuts (power-user parity with Drive/Dropbox) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // "/" focuses search from anywhere (unless already typing).
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (typing) return;

      // Esc clears the current selection.
      if (e.key === "Escape" && selectedIds.size > 0) {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }

      // Ctrl/Cmd+A selects everything currently shown.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        if (filteredFiles.length === 0) return;
        e.preventDefault();
        setSelectedIds(new Set(filteredFiles.map((f) => f.id)));
        return;
      }

      // Ctrl/Cmd+V pastes the clipboard into the current folder (works with an
      // empty selection too — that's the common Explorer flow).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !trash) {
        if (getClipboard()) { e.preventDefault(); void pasteHere(); }
        return;
      }
      // Ctrl/Cmd+C / Ctrl/Cmd+X copy or cut the current selection.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedIds.size > 0 && !trash) {
        e.preventDefault();
        copyToClipboard(Array.from(selectedIds));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && selectedIds.size > 0 && !trash) {
        e.preventDefault();
        cutToClipboard(Array.from(selectedIds));
        return;
      }

      // Plain g / l toggle grid / list.
      if (e.key === "g" && !e.ctrlKey && !e.metaKey) { setViewPersisted("grid"); return; }
      if (e.key === "l" && !e.ctrlKey && !e.metaKey) { setViewPersisted("list"); return; }

      // The rest act on the current selection.
      if (selectedIds.size === 0) return;
      const selected = filteredFiles.filter((f) => selectedIds.has(f.id));

      // Spacebar quick-preview a single selected file (macOS Quick Look style).
      if (e.key === " " && selected.length === 1) {
        e.preventDefault();
        handleFileClick(selected[0]);
        return;
      }
      // Delete / Backspace → trash selection.
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void batchDelete();
        return;
      }
      // F2 renames a single selected file.
      if (e.key === "F2" && selected.length === 1) {
        e.preventDefault();
        void handleFileAction("rename", selected[0]);
        return;
      }
      // m moves the selection.
      if (e.key === "m" && !trash) {
        e.preventDefault();
        setMoveIds(Array.from(selectedIds));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, filteredFiles, trash]);

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
            ref={searchInputRef}
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
              setEncryptDialogOpen(true);
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
                ref={uploadInputRef}
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

          {/* Paste — shown only when the clipboard has files (Explorer style) */}
          {clipboard && !trash && !favorites && (
            <Button
              variant="secondary"
              size="sm"
              className="h-9 gap-1.5 px-2 sm:px-3 border border-accent/30 bg-accent/5"
              onClick={pasteHere}
              title={`Paste ${clipboard.count} ${clipboard.mode === "cut" ? "(move)" : "(copy)"}`}
            >
              <ClipboardPaste className="h-4 w-4 sm:mr-0.5" />
              <span className="hidden sm:inline">Paste ({clipboard.count})</span>
            </Button>
          )}

          {/* Sort dropdown — lets grid view sort too, not just list headers */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              className="h-9 gap-1.5 px-2 sm:px-3"
              onClick={() => setSortMenuOpen((o) => !o)}
              title="Sort files"
            >
              <ArrowDownUp className="h-4 w-4 sm:mr-0.5" />
              <span className="hidden sm:inline">
                {SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Sort"}
              </span>
            </Button>
            <AnimatePresence>
              {sortMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSortMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.14 }}
                    className="absolute right-0 z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-border/60 bg-surface-elevated/95 py-1 shadow-2xl backdrop-blur-xl"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => chooseSort(opt.key)}
                        className={cn(
                          "flex w-full items-center justify-between px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-accent/10",
                          sortBy === opt.key ? "text-accent" : "text-foreground"
                        )}
                      >
                        {opt.label}
                        {sortBy === opt.key && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                    <div className="my-1 mx-2 border-t border-border/40" />
                    <button
                      onClick={toggleSortOrder}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/10"
                    >
                      {sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                      {sortOrder === "asc" ? "Ascending" : "Descending"}
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-border/40 rounded-lg overflow-hidden ml-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "rounded-none h-8 w-8",
                view === "grid" ? "bg-accent/10 text-accent" : ""
              )}
              onClick={() => setViewPersisted("grid")}
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
              onClick={() => setViewPersisted("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter chips ── */}
      {!trash && !favorites && !search && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTypeFilter(key); setSelectedIds(new Set()); }}
              className={cn(
                "tap inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
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
            {!trash && (
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => copyToClipboard(Array.from(selectedIds))}>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            )}
            {!trash && (
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => cutToClipboard(Array.from(selectedIds))}>
                <Scissors className="h-3.5 w-3.5" />
                Cut
              </Button>
            )}
            {!trash && (
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setMoveIds(Array.from(selectedIds))}>
                <Move className="h-3.5 w-3.5" />
                Move
              </Button>
            )}
            {!trash && selectedIds.size >= 2 && (
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setBulkRenameIds(Array.from(selectedIds))}>
                <PencilRuler className="h-3.5 w-3.5" />
                Rename
              </Button>
            )}
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

      {shareFile && (
        <ShareDialog
          fileId={shareFile.id}
          fileName={shareFile.name}
          fileType={shareFile.mimeType}
          isNote={shareFile.isNote}
          onClose={() => setShareFile(null)}
        />
      )}

      <EncryptionSetupDialog
        open={encryptDialogOpen}
        onClose={() => setEncryptDialogOpen(false)}
        onConfirm={(pass) => {
          setEncryptPassphrase(pass);
          setEncryptUploads(true);
        }}
      />

      {moveIds && (
        <MoveToFolderDialog
          count={moveIds.length}
          disabledFolderIds={folderId ? [folderId] : []}
          onCancel={() => setMoveIds(null)}
          onConfirm={(dest) => executeMove(moveIds, dest)}
        />
      )}

      {bulkRenameIds && (
        <BulkRenameDialog
          files={allFiles
            .filter((f) => bulkRenameIds.includes(f.id))
            .map((f) => ({ id: f.id, name: f.name }))}
          onCancel={() => setBulkRenameIds(null)}
          onConfirm={executeBulkRename}
        />
      )}

      {dialogs}
    </div>

    {showUploadPanel && uploadQueue && (
      <AnimatePresence mode="wait">
        <UploadPanel key="upload-panel" queue={uploadQueue} onDismiss={() => setShowUploadPanel(false)} />
      </AnimatePresence>
    )}
    </DndContext>
  );
}
