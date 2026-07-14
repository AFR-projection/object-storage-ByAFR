"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import {
  Download, Share2, Info, Maximize2, Minimize2, X,
  AlertCircle, FileText, Play
} from "lucide-react";
import { cn, formatBytes, formatDate, getMimeCategory, getFileExtension } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { File as FileRecord } from "@/lib/db/schema";
import dynamic from "next/dynamic";
import { ShareDialog } from "./share-dialog";

const ImageViewer = dynamic(() => import("@/components/media-viewers/image-viewer").then((m) => m.ImageViewer), { ssr: false });
const VideoViewer = dynamic(() => import("@/components/media-viewers/video-viewer").then((m) => m.VideoViewer), { ssr: false });
const AudioViewer = dynamic(() => import("@/components/media-viewers/audio-viewer").then((m) => m.AudioViewer), { ssr: false });
const PdfViewer = dynamic(() => import("@/components/media-viewers/pdf-viewer").then((m) => m.PdfViewer), { ssr: false });
const TextViewer = dynamic(() => import("@/components/media-viewers/text-viewer").then((m) => m.TextViewer), { ssr: false });
const OfficeViewer = dynamic(() => import("@/components/media-viewers/office-viewer").then((m) => m.OfficeViewer), { ssr: false });
const SvgViewer = dynamic(() => import("@/components/media-viewers/svg-viewer").then((m) => m.SvgViewer), { ssr: false });
const ArchiveViewer = dynamic(() => import("@/components/media-viewers/archive-viewer").then((m) => m.ArchiveViewer), { ssr: false });

interface FilePreviewProps {
  file: FileRecord;
  onClose: () => void;
}

const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv", "text/html", "text/css", "text/javascript", "application/json", "application/xml"]);
const CODE_EXTENSIONS = new Set(["js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "hpp", "cs", "php", "html", "htm", "css", "scss", "less", "sass", "json", "yaml", "yml", "toml", "xml", "svg", "sql", "sh", "bash", "zsh", "fish", "ps1", "bat", "vue", "svelte", "astro", "env", "gitignore", "dockerignore", "log", "ini", "cfg", "conf"]);
const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);

function canPreviewInline(category: string, ext: string, mimeType: string): boolean {
  if (category === "pdf" || category === "image" || category === "video" || category === "audio") return true;
  if (mimeType === "image/svg+xml" || ext === "svg") return true;
  if (TEXT_MIMES.has(mimeType) || CODE_EXTENSIONS.has(ext)) return true;
  if (OFFICE_EXTENSIONS.has(ext)) return true;
  if (category === "archive") return true;
  return false;
}

export function FilePreview({ file, onClose }: FilePreviewProps) {
  const category = getMimeCategory(file.mimeType);
  const ext = getFileExtension(file.name);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const isSvg = file.mimeType === "image/svg+xml" || ext === "svg";
  const isText = TEXT_MIMES.has(file.mimeType) || CODE_EXTENSIONS.has(ext);
  const isOffice = OFFICE_EXTENSIONS.has(ext);
  const isArchive = category === "archive";

  const streamUrl = useMemo(() => {
    if (file.isNote) return null;
    return `/api/files/${file.id}/preview`;
  }, [file.id, file.isNote]);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, fullscreen]);

  async function handleShare() {
    setShowShare(true);
  }

  function renderContent() {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (previewError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <p className="text-sm font-medium">{previewError}</p>
          <Button className="mt-4" variant="secondary" onClick={() => window.open(`/api/download/${file.id}`)}>
            <Download className="h-4 w-4 mr-1.5" /> Download instead
          </Button>
        </div>
      );
    }

    // PDF
    if (category === "pdf" && streamUrl) {
      return <PdfViewer fileId={file.id} previewUrl={streamUrl} />;
    }

    // Image (non-SVG)
    if (category === "image" && !isSvg && streamUrl) {
      return <ImageViewer src={streamUrl} fileName={file.name} mimeType={file.mimeType} />;
    }

    // SVG
    if (isSvg && streamUrl) {
      return <SvgViewer src={streamUrl} fileName={file.name} />;
    }

    // Video
    if (category === "video" && streamUrl) {
      return <VideoViewer src={streamUrl} fileName={file.name} />;
    }

    // Audio
    if (category === "audio" && streamUrl) {
      return <AudioViewer src={streamUrl} fileName={file.name} />;
    }

    // Text / Code
    if (isText && streamUrl) {
      return <TextViewer src={streamUrl} fileName={file.name} mimeType={file.mimeType} />;
    }

    // Office documents — gunakan Office Viewer yg sudah pintar (Microsoft Office Online embed)
    if (isOffice && streamUrl) {
      return <OfficeViewer src={streamUrl} fileName={file.name} mimeType={file.mimeType} fileId={file.id} />;
    }

    // Archive — tampilkan file tree + ekstrak individual file
    if (isArchive) {
      return <ArchiveViewer fileName={file.name} mimeType={file.mimeType} sizeBytes={file.sizeBytes} fileId={file.id} />;
    }

    // Fallback — coba stream langsung (untuk file yg tidak dikenal, browser mungkin bisa handle)
    if (streamUrl) {
      const isStreamable = category === "other" || category === "document" || category === "spreadsheet" || category === "presentation";
      if (isStreamable) {
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0 bg-white">
              <iframe src={streamUrl} className="w-full h-full border-0" title={file.name} />
            </div>
          </div>
        );
      }
    }

    // Generic fallback
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/5">
          <FileText className="h-8 w-8 text-accent/40" />
        </div>
        <p className="text-sm font-medium">Preview not available</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This file type cannot be previewed inline</p>
        <Button className="mt-4" onClick={() => window.open(`/api/download/${file.id}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Download
        </Button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          "fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm",
          fullscreen ? "p-0" : "p-2 sm:p-4 lg:p-6"
        )}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={cn(
            "relative flex flex-col bg-card border border-border/50 shadow-2xl overflow-hidden",
            "rounded-2xl w-full h-full",
            fullscreen && "rounded-none"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/80 backdrop-blur-sm shrink-0">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{file.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatBytes(file.sizeBytes)} &middot; {getMimeCategory(file.mimeType).toUpperCase()} &middot; {formatDate(file.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`/api/download/${file.id}`)}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowInfo(!showInfo)}>
                <Info className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFullscreen(!fullscreen)}>
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 bg-[repeating-conic-gradient(#262626_0%_25%,#1a1a1a_0%_50%)] bg-[length:16px_16px]">
            {renderContent()}
          </div>

          {/* Info Panel */}
          {showInfo && (
            <div className="absolute top-14 right-4 w-72 bg-card border border-border/50 rounded-xl shadow-xl p-4 z-10 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">File Info</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-mono truncate ml-2 max-w-[160px]">{file.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-mono">{file.mimeType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{formatBytes(file.sizeBytes)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDate(file.createdAt)}</span></div>
              </div>
            </div>
          )}

          {/* Share Dialog */}
          {showShare && (
            <ShareDialog fileId={file.id} fileName={file.name} fileType={file.mimeType} onClose={() => setShowShare(false)} />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
