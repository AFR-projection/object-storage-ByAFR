"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, Underline as UnderlineIcon, Code,
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks,
  Quote, Code2, Minus, Highlighter, Link2, Undo2, Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** A toolbar button that reflects active state from the editor. */
function TBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted/60 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none",
        active && "bg-accent/15 text-accent"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border/60" aria-hidden />;
}

const HIGHLIGHT_COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe"];
const TEXT_COLORS = ["#f87171", "#fb923c", "#facc15", "#34d399", "#60a5fa", "#a78bfa"];

export function NoteToolbar({ editor }: { editor: Editor }) {
  // Re-render on every selection/transaction so active states stay in sync.
  // (The parent forces this via a key/state bump; see note-editor.)
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL tautan:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-1">
      <TBtn title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="h-4 w-4" />
      </TBtn>
      <TBtn title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="h-4 w-4" />
      </TBtn>

      <Divider />

      <TBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-4 w-4" />
      </TBtn>
      <TBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </TBtn>
      <TBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </TBtn>

      <Divider />

      <TBtn title="Bold (Ctrl+B)" active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </TBtn>
      <TBtn title="Italic (Ctrl+I)" active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </TBtn>
      <TBtn title="Underline (Ctrl+U)" active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </TBtn>
      <TBtn title="Strikethrough" active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </TBtn>
      <TBtn title="Inline code" active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="h-4 w-4" />
      </TBtn>
      <TBtn title="Tautan" active={editor.isActive("link")} onClick={setLink}>
        <Link2 className="h-4 w-4" />
      </TBtn>

      <Divider />

      {/* Highlight swatches */}
      <div className="flex items-center gap-0.5">
        <Highlighter className="h-4 w-4 text-muted-foreground" />
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={`Highlight ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
            className="h-4 w-4 rounded-full border border-border/40 transition-transform hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <Divider />

      {/* Text color swatches */}
      <div className="flex items-center gap-0.5">
        <span className="text-[11px] font-bold text-muted-foreground">A</span>
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={`Warna teks ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setColor(c).run()}
            className="h-4 w-4 rounded-full border border-border/40 transition-transform hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          type="button"
          title="Reset warna"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().unsetColor().run()}
          className="ml-0.5 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted/60"
        >
          reset
        </button>
      </div>

      <Divider />

      <TBtn title="Bullet list" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </TBtn>
      <TBtn title="Numbered list" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </TBtn>
      <TBtn title="To-do list" active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </TBtn>
      <TBtn title="Quote" active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </TBtn>
      <TBtn title="Code block" active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 className="h-4 w-4" />
      </TBtn>
      <TBtn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </TBtn>
    </div>
  );
}
