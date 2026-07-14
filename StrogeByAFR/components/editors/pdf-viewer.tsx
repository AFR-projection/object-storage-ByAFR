"use client";

import { Document, Page, pdfjs } from "react-pdf";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const fileSource = previewUrl ?? `/api/download/${fileId}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          Halaman {page} dari {numPages || "?"}
        </span>
        <Button variant="ghost" size="icon" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex justify-center overflow-auto rounded-lg border border-border">
        <Document
          file={fileSource}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={<div className="p-8 text-muted-foreground">Memuat PDF...</div>}
          error={<div className="p-8 text-red-500">Gagal memuat PDF</div>}
        >
          <Page pageNumber={page} width={500} />
        </Document>
      </div>
    </div>
  );
}
