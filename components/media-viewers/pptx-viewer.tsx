"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/system/spinner";
import { init } from "pptx-preview";
import { usePreviewSource } from "@/hooks/use-preview-source";
import { Button } from "@/components/ui/button";
import { Download, Presentation, RefreshCw } from "lucide-react";
import { downloadViewerSource } from "@/lib/download/download-actions";

interface PptxViewerProps {
  src: string;
  fileName: string;
  fileId: string;
}

export function PptxViewer({ src, fileName, fileId }: PptxViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { arrayBuffer, loading, error } = usePreviewSource(src);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!arrayBuffer || !wrapperRef.current) return;

    let cancelled = false;
    setRendering(true);
    setRenderError(null);

    // Clear previous render
    if (wrapperRef.current) {
      wrapperRef.current.innerHTML = "";
    }

    const el = wrapperRef.current;
    if (!el) return;

    try {
      const width = containerRef.current?.clientWidth ?? 960;
      const height = Math.round(width * 9 / 16);
      const previewer = init(el, { width: Math.min(width - 32, 960), height });

      previewer
        .preview(arrayBuffer)
        .then(() => {
          if (!cancelled) setRendering(false);
        })
        .catch(() => {
          if (!cancelled) {
            setRenderError("Presentasi tidak dapat dirender");
            setRendering(false);
          }
        });
    } catch {
      if (!cancelled) {
        setRenderError("Presentasi tidak dapat dirender");
        setRendering(false);
      }
    }

    return () => { cancelled = true; };
  }, [arrayBuffer]);

  if (loading || rendering) {
    return (
      <div className="flex items-center justify-center h-full bg-card">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-muted-foreground">Memuat presentasi...</p>
        </div>
      </div>
    );
  }

  if (error || renderError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-card gap-3 px-6 text-center">
        <Presentation className="h-10 w-10 opacity-40" />
        <p className="text-sm">{error ?? renderError}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Coba lagi
          </Button>
          <Button size="sm" onClick={() => downloadViewerSource(src, fileId, fileName)}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-neutral-900">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Presentation className="h-3.5 w-3.5 text-orange-500 shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{fileName}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadViewerSource(src, fileId, fileName)}>
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto flex justify-center py-6 px-4">
        <div ref={wrapperRef} className="pptx-preview-root" />
      </div>
    </div>
  );
}
