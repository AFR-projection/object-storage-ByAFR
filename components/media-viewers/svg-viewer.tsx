"use client";

import { useEffect, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

interface SvgViewerProps {
  src: string;
  fileName: string;
}

export function SvgViewer({ src, fileName }: SvgViewerProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(src, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.text();
      })
      .then((text) => {
        setSvgContent(text);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [src]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  if (error || !svgContent) {
    return (
      <div className="flex items-center justify-center h-full">
        <img src={src} alt={fileName} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full p-6 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#222_0%_50%)] bg-[length:20px_20px] dark:bg-[repeating-conic-gradient(#333_0%_25%,#2a2a2a_0%_50%)]">
      <div
        className="max-w-full max-h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svgContent) }}
      />
    </div>
  );
}
