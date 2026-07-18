"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

interface SharedNoteViewProps {
  token: string;
  content: unknown;
  /** When true the note is editable and edits are saved back via the token. */
  canEdit: boolean;
}

/**
 * Renders a shared note's Tiptap body. Read-only for "view" shares; editable
 * with debounced autosave (PUT /api/shared/[token]) for "edit" shares. Uses the
 * same extension set as the owner's editor so content round-trips faithfully.
 */
export function SharedNoteView({ token, content, canEdit }: SharedNoteViewProps) {
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure({ link: { openOnClick: true } }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
    ],
    content: (content as Record<string, unknown>) ?? "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[60vh] focus:outline-none",
      },
    },
  });

  // Keep editability in sync if the prop ever changes.
  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  useEffect(() => {
    if (!editor || !canEdit) return;
    const handler = () => {
      if (editor.isDestroyed) return;
      const json = editor.getJSON();
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      setSaveState("saving");
      saveTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/shared/${token}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: json }),
          });
          const ok = res.ok && (await res.json().catch(() => ({})))?.success !== false;
          setSaveState(ok ? "saved" : "error");
        } catch {
          setSaveState("error");
        }
      }, 1200);
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor, canEdit, token]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <div className="mb-4 flex items-center justify-end gap-2 text-[11px]">
        {canEdit ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-medium text-accent">
              <Pencil className="h-3 w-3" /> Bisa diedit
            </span>
            <SaveBadge state={saveState} />
          </>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 font-medium text-muted-foreground">
            <Lock className="h-3 w-3" /> Hanya baca
          </span>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { icon: <Loader2 className="h-3 w-3 animate-spin" />, text: "Menyimpan…", cls: "text-muted-foreground" },
    saved: { icon: <Check className="h-3 w-3" />, text: "Tersimpan", cls: "text-emerald-500" },
    error: { icon: <X className="h-3 w-3" />, text: "Gagal simpan", cls: "text-danger" },
  } as const;
  const m = map[state];
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", m.cls)}>
      {m.icon} {m.text}
    </span>
  );
}
