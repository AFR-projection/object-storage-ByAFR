"use client";

import { useState, useEffect, useCallback } from "react";
import { FileSpreadsheet, FileText, Presentation, Download, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OfficeViewerProps {
  src: string;
  fileName: string;
  mimeType: string;
  fileId: string;
}

type EmbedStrategy = "office-online" | "direct-iframe" | "failed";

const OFFICE_ONLINE_FORMATS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);
const DIRECT_IFRAME_FORMATS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);

function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function OfficeViewer({ src, fileName, mimeType, fileId }: OfficeViewerProps) {
  const isSpreadsheet = mimeType.includes("sheet") || mimeType.includes("excel") || getExt(fileName) === "xls" || getExt(fileName) === "xlsx" || getExt(fileName) === "ods";
  const isPresentation = mimeType.includes("presentation") || mimeType.includes("powerpoint") || getExt(fileName) === "ppt" || getExt(fileName) === "pptx" || getExt(fileName) === "odp";
  const Icon = isSpreadsheet ? FileSpreadsheet : isPresentation ? Presentation : FileText;

  const color = isSpreadsheet
    ? "text-emerald-500 bg-emerald-500/10"
    : isPresentation
    ? "text-orange-500 bg-orange-500/10"
    : "text-blue-500 bg-blue-500/10";

  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [embedStrategy, setEmbedStrategy] = useState<EmbedStrategy>("office-online");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ext = getExt(fileName);
  const canUseOfficeOnline = OFFICE_ONLINE_FORMATS.has(ext);
  const canUseDirectIframe = DIRECT_IFRAME_FORMATS.has(ext);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/files/${fileId}/preview?format=json`);
        const json = await res.json();
        if (!cancelled) {
          if (json.success && json.data?.url) {
            setPresignedUrl(json.data.url);
          } else {
            setPresignedUrl(src);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPresignedUrl(src);
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fileId, src]);

  const handleRetry = useCallback(() => {
    setError(null);
    setEmbedStrategy("office-online");
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <p className="text-sm text-muted-foreground">Preparing office viewer...</p>
        </div>
      </div>
    );
  }

  if (embedStrategy === "office-online" && presignedUrl && canUseOfficeOnline) {
    const officeUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(presignedUrl)}`;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", color)}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-xs text-muted-foreground">
              Powered by Microsoft Office Online
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(officeUrl, "_blank")} title="Open in new tab">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`/api/download/${fileId}`)} title="Download">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-white">
          <iframe
            src={officeUrl}
            className="w-full h-full border-0"
            title={fileName}
            onError={() => setEmbedStrategy("direct-iframe")}
          />
        </div>
      </div>
    );
  }

  if ((embedStrategy === "direct-iframe" || !canUseOfficeOnline) && presignedUrl && canUseDirectIframe) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", color)}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-xs text-muted-foreground">
              Direct preview
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(presignedUrl, "_blank")} title="Open in new tab">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`/api/download/${fileId}`)} title="Download">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-white">
          <iframe
            src={presignedUrl}
            className="w-full h-full border-0"
            title={fileName}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <div className={cn("flex h-20 w-20 items-center justify-center rounded-2xl mb-4", color)}>
        <Icon className="h-10 w-10" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{fileName}</h3>
      <p className="text-sm text-muted-foreground mb-1">
        {isSpreadsheet ? "Spreadsheet" : isPresentation ? "Presentation" : "Document"}
      </p>
      {error && (
        <div className="flex items-center gap-2 mt-2 mb-3 text-xs text-amber-500">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        <Button onClick={() => window.open(`/api/download/${fileId}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Download
        </Button>
        {canUseOfficeOnline && (
          <Button variant="secondary" onClick={handleRetry}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Retry Preview
          </Button>
        )}
      </div>
    </div>
  );
}
