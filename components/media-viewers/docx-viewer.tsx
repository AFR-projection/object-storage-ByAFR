"use client";

import { useState, useEffect } from "react";
import { Spinner } from "@/components/system/spinner";
import mammoth from "mammoth";
import DOMPurify from "isomorphic-dompurify";
import { usePreviewSource } from "@/hooks/use-preview-source";
import { Button } from "@/components/ui/button";
import { Download, FileText, RefreshCw } from "lucide-react";
import { downloadViewerSource } from "@/lib/download/download-actions";

interface DocxViewerProps {
  src: string;
  fileName: string;
  fileId: string;
}

export function DocxViewer({ src, fileName, fileId }: DocxViewerProps) {
  const { arrayBuffer, loading, error } = usePreviewSource(src);
  const [html, setHtml] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!arrayBuffer) return;
    let cancelled = false;

    mammoth
      .convertToHtml({ arrayBuffer }, { includeDefaultStyleMap: true })
      .then((result) => {
        if (cancelled) return;
        setHtml(DOMPurify.sanitize(result.value));
        setParseError(result.messages.length > 0 ? null : null);
      })
      .catch(() => {
        if (!cancelled) {
          setParseError("Dokumen Word tidak dapat dibaca. Coba format .docx.");
          setHtml(null);
        }
      });

    return () => { cancelled = true; };
  }, [arrayBuffer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-card">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-muted-foreground">Memuat dokumen...</p>
        </div>
      </div>
    );
  }

  if (error || parseError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-card gap-3 px-6 text-center">
        <FileText className="h-10 w-10 opacity-40" />
        <p className="text-sm">{error ?? parseError}</p>
        <p className="text-xs text-muted-foreground/60">Format .docx didukung penuh. File .doc lama perlu dikonversi.</p>
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

  if (!html) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground bg-card">
        <p className="text-sm">Dokumen kosong</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{fileName}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadViewerSource(src, fileId, fileName)}>
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <article
          className="max-w-3xl mx-auto px-8 py-10 prose prose-sm dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-table:border-collapse prose-td:border prose-td:border-border/30 prose-td:px-2 prose-td:py-1"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
