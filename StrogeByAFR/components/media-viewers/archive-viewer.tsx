"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Archive, FileText, Folder, FolderOpen, Download,
  ChevronRight, ChevronDown, Loader2, AlertCircle,
  Search, X, FileImage, FileCode, FileAudio, FileVideo
} from "lucide-react";
import { formatBytes, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ArchiveViewerProps {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileId: string;
}

interface ArchiveEntry {
  path: string;
  name: string;
  dir: boolean;
  size: number;
  compressedSize: number;
  date: string;
}

interface ArchiveData {
  entries: ArchiveEntry[];
  summary: {
    totalFiles: number;
    totalFolders: number;
    totalSize: number;
    totalCompressedSize: number;
    format: string;
  };
}

const PREVIEW_EXTENSIONS = new Set([
  "txt", "md", "mdx", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt",
  "swift", "c", "cpp", "h", "hpp", "cs", "php", "html", "htm", "css", "scss",
  "less", "sass", "sql", "sh", "bash", "zsh", "fish", "ps1", "bat", "vue",
  "svelte", "astro", "env", "gitignore", "dockerignore", "log", "csv", "tsv",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico",
  "pdf",
]);

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return FileImage;
  if (["js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "html", "css"].includes(ext)) return FileCode;
  if (["mp3", "wav", "ogg", "flac"].includes(ext)) return FileAudio;
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return FileVideo;
  return FileText;
}

export function ArchiveViewer({ fileName, mimeType, sizeBytes, fileId }: ArchiveViewerProps) {
  const [data, setData] = useState<ArchiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const format = ext === "zip" ? "ZIP" : ext === "rar" ? "RAR" : ext === "7z" ? "7-Zip" : ext === "tar" ? "TAR" : ext === "gz" ? "GZip" : "Archive";

  useEffect(() => {
    let cancelled = false;
    async function loadListing() {
      try {
        const res = await fetch(`/api/files/${fileId}/archive/listing`);
        const json = await res.json();
        if (!cancelled) {
          if (json.success) {
            setData(json.data);
          } else {
            setError(json.error ?? "Failed to load archive listing");
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load archive listing");
          setLoading(false);
        }
      }
    }
    loadListing();
    return () => { cancelled = true; };
  }, [fileId]);

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const handlePreview = useCallback(async (entry: ArchiveEntry) => {
    if (entry.dir) return;
    setPreviewFile({ path: entry.path, name: entry.name });
    setPreviewContent(null);
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      const res = await fetch(`/api/files/${fileId}/archive/extract?path=${encodeURIComponent(entry.path)}`);
      if (!res.ok) throw new Error("Failed to extract file");

      const contentType = res.headers.get("content-type") || "";
      if (contentType.startsWith("text/") || contentType === "application/json") {
        const text = await res.text();
        setPreviewContent(text.length > 500000 ? text.slice(0, 500000) + "\n\n[... truncated at 500KB]" : text);
      } else {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPreviewContent(url);
      }
    } catch {
      setPreviewError("Failed to extract file");
    }
    setPreviewLoading(false);
  }, [fileId]);

  const filteredEntries = searchQuery
    ? data?.entries.filter((e) => !e.dir && e.path.toLowerCase().includes(searchQuery.toLowerCase())) ?? []
    : data?.entries.filter((e) => !e.dir) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Reading archive contents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
          <AlertCircle className="h-8 w-8 text-amber-500" />
        </div>
        <p className="text-sm font-medium mb-1">Cannot read archive</p>
        <p className="text-xs text-muted-foreground/60 mb-4">{error}</p>
        <Button onClick={() => window.open(`/api/download/${fileId}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Download Archive
        </Button>
      </div>
    );
  }

  if (previewFile && previewContent !== null) {
    const ext = previewFile.name.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
    const isText = !isImage;

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setPreviewFile(null); setPreviewContent(null); }}>
              <ChevronDown className="h-4 w-4 rotate-90" />
            </Button>
            <span className="text-xs font-mono truncate">{previewFile.path}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`/api/files/${fileId}/archive/extract?path=${encodeURIComponent(previewFile.path)}`, "_blank")}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPreviewFile(null); setPreviewContent(null); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-[repeating-conic-gradient(#262626_0%_25%,#1a1a1a_0%_50%)] bg-[length:16px_16px]">
          {isImage ? (
            <div className="flex items-center justify-center h-full p-4">
              <img src={previewContent} alt={previewFile.name} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <pre className="p-4 font-mono text-[13px] text-foreground whitespace-pre-wrap break-all">
              {previewContent}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (previewLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPreviewFile(null); setPreviewError(null); setPreviewLoading(false); }}>
              <ChevronDown className="h-4 w-4 rotate-90" />
            </Button>
            <span className="text-xs font-mono text-muted-foreground">Extracting...</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPreviewFile(null); setPreviewError(null); }}>
            <ChevronDown className="h-4 w-4 rotate-90" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <p className="text-sm">{previewError}</p>
          </div>
        </div>
      </div>
    );
  }

  const summary = data?.summary;

  // Build folder tree for display
  function renderTree(entries: ArchiveEntry[]) {
    const children = entries.filter((e) => {
      if (e.dir) {
        const parentPath = e.path === "" ? "root" : e.path;
        return expandedFolders.has(parentPath === "root" ? "root" : parentPath);
      }
      const parentDir = e.path.includes("/") ? e.path.substring(0, e.path.lastIndexOf("/")) : "root";
      return expandedFolders.has(parentDir);
    });

    return children.map((entry) => {
      if (entry.dir) {
        const isExpanded = expandedFolders.has(entry.path);
        const depth = entry.path.split("/").length - (entry.path.endsWith("/") ? 2 : 1);
        return (
          <div key={entry.path}>
            <button
              onClick={() => toggleFolder(entry.path)}
              className={cn(
                "w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent/5 transition-colors",
                "text-xs text-muted-foreground"
              )}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              {isExpanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
              <span className="truncate">{entry.name || "(root)"}</span>
            </button>
            {isExpanded && renderTree(entries)}
          </div>
        );
      }
      return null;
    });
  }

  function renderFileList(entries: ArchiveEntry[]) {
    const files = searchQuery
      ? entries.filter((e) => !e.dir && e.path.toLowerCase().includes(searchQuery.toLowerCase()))
      : entries.filter((e) => !e.dir);

    return files.map((entry) => {
      const depth = entry.path.includes("/") ? entry.path.split("/").length : 0;
      const Icon = getFileIcon(entry.name);
      const canPreview = PREVIEW_EXTENSIONS.has(entry.name.split(".").pop()?.toLowerCase() ?? "");

      return (
        <button
          key={entry.path}
          onClick={() => canPreview && handlePreview(entry)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/5 transition-colors group",
            canPreview ? "cursor-pointer" : "cursor-default"
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <span className="flex-1 truncate text-xs">{entry.name}</span>
          <span className="text-[10px] text-muted-foreground/40 shrink-0">
            {formatBytes(entry.size)}
          </span>
          {canPreview && (
            <span className="text-[10px] text-accent/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              preview
            </span>
          )}
        </button>
      );
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
            <Archive className="h-4 w-4 text-amber-500" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-medium block truncate">{fileName}</span>
            <span className="text-[10px] text-muted-foreground/60">
              {format} &middot; {summary ? `${summary.totalFiles} file${summary.totalFiles !== 1 ? "s" : ""}` : ""}
              {summary && summary.totalSize ? ` &middot; ${formatBytes(summary.totalSize)}` : ""}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => window.open(`/api/download/${fileId}`)} title="Download archive">
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative px-3 py-2 border-b border-border/20">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full pl-7 pr-7 py-1.5 text-xs bg-muted/20 border border-border/30 rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/50"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-5 top-1/2 -translate-y-1/2">
            <X className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-muted-foreground" />
          </button>
        )}
      </div>

      {/* File listing */}
      <div className="flex-1 overflow-auto">
        {searchQuery ? (
          <div className="py-1">
            {filteredEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 text-center py-8">No files match "{searchQuery}"</p>
            ) : (
              renderFileList(data?.entries ?? [])
            )}
          </div>
        ) : (
          <div className="py-1">
            {renderTree(data?.entries ?? [])}
            {renderFileList(data?.entries ?? [])}
          </div>
        )}
      </div>

      {/* Status bar */}
      {summary && !searchQuery && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border/30 bg-muted/20 text-[10px] text-muted-foreground/60 shrink-0">
          <span>{summary.totalFiles} files</span>
          {summary.totalFolders > 0 && <span>{summary.totalFolders} folders</span>}
          <span>{formatBytes(summary.totalSize)} (compressed: {formatBytes(summary.totalCompressedSize)})</span>
        </div>
      )}
    </div>
  );
}
