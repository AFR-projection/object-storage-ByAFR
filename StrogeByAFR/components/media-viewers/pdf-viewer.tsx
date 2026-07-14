"use client";

import { Document, Page, pdfjs } from "react-pdf";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  fileId: string;
  previewUrl?: string;
}

export function PdfViewer({ fileId, previewUrl }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileSource = previewUrl ?? `/api/download/${fileId}`;

  const fitToWidth = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 40;
      setScale(containerWidth / 800);
    }
  }, []);

  useEffect(() => {
    fitToWidth();
    window.addEventListener("resize", fitToWidth);
    return () => window.removeEventListener("resize", fitToWidth);
  }, [fitToWidth]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setPage((p) => Math.min(numPages, p + 1)); }
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.2, 3));
      if (e.key === "-") setScale((s) => Math.max(s - 0.2, 0.3));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [numPages]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-[120px] justify-center">
          <input
            type="number"
            min={1}
            max={numPages}
            value={page}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 1 && v <= numPages) setPage(v);
            }}
            className="w-12 text-center bg-transparent border border-border/50 rounded px-1 py-0.5 text-sm font-mono"
          />
          <span>/ {numPages || "—"}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border/40 mx-2" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.max(s - 0.2, 0.3))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.min(s + 0.2, 3))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border/40 mx-2" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRotation((r) => r + 90)}>
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fitToWidth}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* PDF Pages */}
      <div ref={containerRef} className="flex-1 overflow-auto flex justify-center bg-muted/10 p-5">
        <Document
          file={fileSource}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-sm font-medium">Failed to load PDF</p>
            </div>
          }
        >
          <Page
            pageNumber={page}
            scale={scale}
            rotate={rotation}
            className="shadow-lg mb-4"
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
}
