"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  src: string;
  fileName: string;
  mimeType: string;
}

export function ImageViewer({ src, fileName, mimeType }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") reset();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 5));
      if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.25));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reset]);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(Math.max(z + delta, 0.25), 5));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-border/30 bg-muted/20">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(z + 0.25, 5))} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <span className="min-w-[48px] text-center text-xs font-mono text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border/40 mx-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRotation((r) => r + 90)} title="Rotate">
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={reset} title="Reset">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border/40 mx-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(src)} title="Open full size">
          <Minimize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 overflow-hidden flex items-center justify-center bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#222_0%_50%)] bg-[length:20px_20px] dark:bg-[repeating-conic-gradient(#333_0%_25%,#2a2a2a_0%_50%)]",
          zoom > 1 ? "cursor-grab" : "cursor-default",
          isDragging && "cursor-grabbing"
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={fileName}
          className="max-w-full max-h-full select-none transition-transform duration-100"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
          }}
          onLoad={(e) => {
            const img = e.target as HTMLImageElement;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          draggable={false}
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/30 bg-muted/20 text-[11px] text-muted-foreground">
        <span>{naturalSize.w} × {naturalSize.h} px</span>
        <span>{mimeType}</span>
      </div>
    </div>
  );
}
