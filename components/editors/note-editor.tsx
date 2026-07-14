"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { File as FileRecord } from "@/lib/db/schema";

interface NoteEditorProps {
  file: FileRecord;
  onClose: () => void;
}

export function NoteEditor({ file, onClose }: NoteEditorProps) {
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing..." }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[400px] focus:outline-none px-1",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    let cancelled = false;

    apiFetch<{ file: FileRecord; content: { contentJson: unknown } | null }>(`/api/files/${file.id}`).then((res) => {
      if (cancelled || !editor || editor.isDestroyed) return;
      if (res.data?.content?.contentJson) {
        editor.commands.setContent(res.data.content.contentJson as Record<string, unknown>);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [file.id, editor]);

  const save = useCallback(
    (content: unknown) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        await apiFetch(`/api/files/${file.id}`, {
          method: "PUT",
          body: JSON.stringify({ content }),
        });
      }, 2000);
    },
    [file.id]
  );

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      if (!editor.isDestroyed) save(editor.getJSON());
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor, save]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-3xl rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{file.name}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Auto-save enabled</span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-6">
          <EditorContent editor={editor} />
        </div>
      </motion.div>
    </motion.div>
  );
}
