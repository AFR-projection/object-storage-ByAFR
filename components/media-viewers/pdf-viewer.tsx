"use client";

import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { downloadViewerSource } from "@/lib/download/download-actions";

interface PdfViewerProps {
  fileId: string;
  previewUrl?: string;
  fileName?: string;
}

export function PdfViewer({ fileId, previewUrl, fileName }: PdfViewerProps) {
  const src = previewUrl ?? `/api/files/${fileId}/preview`;

  return (
    <div className="flex flex-col h-full bg-neutral-800">
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-border/30 bg-muted/20 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.open(src, "_blank")}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Tab baru
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => downloadViewerSource(src, fileId, fileName ?? "document.pdf")}>
          <Download className="h-3.5 w-3.5 mr-1" /> Download
        </Button>
      </div>
      <iframe
        src={`${src}#toolbar=1&navpanes=0&view=FitH`}
        className="flex-1 w-full border-0 bg-white min-h-0"
        title="PDF Preview"
      />
    </div>
  );
}
