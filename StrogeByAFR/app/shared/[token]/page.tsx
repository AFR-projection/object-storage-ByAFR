"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Cloud, Loader2, AlertCircle, Eye, Clock } from "lucide-react";
import { formatBytes, getMimeCategory, getFileExtension } from "@/lib/utils";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/components/media-viewers/pdf-viewer").then((m) => m.PdfViewer), { ssr: false });
const ImageViewer = dynamic(() => import("@/components/media-viewers/image-viewer").then((m) => m.ImageViewer), { ssr: false });
const VideoViewer = dynamic(() => import("@/components/media-viewers/video-viewer").then((m) => m.VideoViewer), { ssr: false });
const AudioViewer = dynamic(() => import("@/components/media-viewers/audio-viewer").then((m) => m.AudioViewer), { ssr: false });
const TextViewer = dynamic(() => import("@/components/media-viewers/text-viewer").then((m) => m.TextViewer), { ssr: false });
const SvgViewer = dynamic(() => import("@/components/media-viewers/svg-viewer").then((m) => m.SvgViewer), { ssr: false });

export default function PublicSharedPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<{
    file: { id: string; name: string; mimeType: string; sizeBytes: number; isNote?: boolean };
    accessCount?: number;
    maxAccessCount?: number;
    lastAccessedAt?: string;
    expiresAt?: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/shared/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data);
        else setError(json.error ?? "Not found");
      })
      .catch(() => setError("Failed to load shared file"));
  }, [token]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          {error ? (
            <>
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">{error}</p>
            </>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          )}
        </div>
      </div>
    );
  }

  const category = getMimeCategory(data.file.mimeType);
  const ext = getFileExtension(data.file.name);
  const isSvg = data.file.mimeType === "image/svg+xml" || ext === "svg";
  const isText = data.file.mimeType.startsWith("text/") || data.file.mimeType === "application/json" || data.file.mimeType === "application/xml";

  const canPreview = category === "pdf" || category === "image" || category === "video" || category === "audio" || isSvg || isText;

  // Gunakan streaming endpoint publik — view only, no download
  const previewUrl = `/api/shared/${token}/preview`;

  return (
    <div className="min-h-screen bg-background">
      {canPreview ? (
        <div className="h-screen flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Cloud className="h-5 w-5 text-accent shrink-0" />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">{data.file.name}</h1>
                <p className="text-[11px] text-muted-foreground">{formatBytes(data.file.sizeBytes)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {data.maxAccessCount && (
                <div className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  <span>{data.accessCount} / {data.maxAccessCount}</span>
                </div>
              )}
              {data.expiresAt && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(data.expiresAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Preview — view only, no download button */}
          <div className="flex-1 min-h-0">
            {category === "pdf" && <PdfViewer fileId={data.file.id} previewUrl={previewUrl} />}
            {category === "image" && !isSvg && <ImageViewer src={previewUrl} fileName={data.file.name} mimeType={data.file.mimeType} />}
            {isSvg && <SvgViewer src={previewUrl} fileName={data.file.name} />}
            {category === "video" && <VideoViewer src={previewUrl} fileName={data.file.name} />}
            {category === "audio" && <AudioViewer src={previewUrl} fileName={data.file.name} />}
            {isText && <TextViewer src={previewUrl} fileName={data.file.name} mimeType={data.file.mimeType} />}
          </div>
        </div>
      ) : (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-medium">
            <Cloud className="mx-auto h-12 w-12 text-accent mb-4" />
            <h1 className="text-xl font-bold truncate">{data.file.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{formatBytes(data.file.sizeBytes)}</p>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              {data.maxAccessCount && (
                <div className="flex items-center justify-center gap-1">
                  <Eye className="h-3 w-3" />
                  <span>{data.accessCount} / {data.maxAccessCount} akses</span>
                </div>
              )}
              {data.expiresAt && (
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Kadaluarsa: {new Date(data.expiresAt).toLocaleString()}</span>
                </div>
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground/60">Tipe file ini tidak bisa dipratinjau</p>
          </div>
        </div>
      )}
    </div>
  );
}
