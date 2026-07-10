"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { RotateCw, Minimize2 } from "lucide-react";

interface ImageEditorProps {
  fileId: string;
  previewUrl: string;
}

export function ImageEditor({ fileId, previewUrl }: ImageEditorProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEdit(action: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/files/edit", {
        method: "POST",
        body: JSON.stringify({
          fileId,
          action,
          rotate: action === "rotate" ? 90 : undefined,
          quality: action === "compress" ? 75 : undefined,
        }),
      });
      if (!res.success) {
        setError(res.error ?? "Edit gagal");
        return;
      }
      window.location.reload();
    } catch {
      setError("Edit gagal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg bg-surface-hover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Preview" className="h-auto w-full object-contain max-h-[60vh]" />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={saving} onClick={() => handleEdit("rotate")}>
          <RotateCw className="h-4 w-4 mr-1" /> Rotate
        </Button>
        <Button variant="secondary" size="sm" disabled={saving} onClick={() => handleEdit("compress")}>
          <Minimize2 className="h-4 w-4 mr-1" /> Compress
        </Button>
      </div>
    </div>
  );
}
