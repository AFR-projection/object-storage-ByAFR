"use client";

import { useState, useEffect } from "react";

type PreviewSourceState = {
  arrayBuffer: ArrayBuffer | null;
  blobUrl: string | null;
  loading: boolean;
  error: string | null;
};

/**
 * Fetch file bytes for in-browser preview. Uses session cookies for API routes
 * and supports pre-decrypted blob: URLs for encrypted files.
 */
export function usePreviewSource(src: string | null): PreviewSourceState {
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!src);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setArrayBuffer(null);
      setBlobUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let ownedBlobUrl: string | null = null;

    const url = src;
    async function load() {
      setLoading(true);
      setError(null);
      setArrayBuffer(null);

      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          throw new Error(`Gagal memuat file (${res.status})`);
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        ownedBlobUrl = URL.createObjectURL(new Blob([buf]));
        setArrayBuffer(buf);
        setBlobUrl(ownedBlobUrl);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat preview");
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (ownedBlobUrl) URL.revokeObjectURL(ownedBlobUrl);
    };
  }, [src]);

  return { arrayBuffer, blobUrl, loading, error };
}
