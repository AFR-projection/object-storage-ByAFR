"use client";

import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import type { Editor, Range } from "@tiptap/core";
import { SlashMenu, type SlashItem, type SlashMenuRef } from "./slash-menu";

/**
 * Notion-style "/" slash command. Typing "/" opens a filterable block menu;
 * picking an item runs the matching editor command. Built on Tiptap's Suggestion
 * utility + a React-rendered popup positioned at the caret. No tippy/popper
 * dependency — a lightweight fixed-position wrapper keeps the bundle small.
 */

export const SLASH_ITEMS: SlashItem[] = [
  { title: "Text", desc: "Paragraf biasa", icon: "Type", keywords: ["paragraph", "text", "teks"],
    run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: "Heading 1", desc: "Judul besar", icon: "Heading1", keywords: ["h1", "judul", "title"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run() },
  { title: "Heading 2", desc: "Sub-judul", icon: "Heading2", keywords: ["h2", "subjudul"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run() },
  { title: "Heading 3", desc: "Sub-sub-judul", icon: "Heading3", keywords: ["h3"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run() },
  { title: "Bullet List", desc: "Daftar poin", icon: "List", keywords: ["ul", "bullet", "list", "daftar"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Numbered List", desc: "Daftar bernomor", icon: "ListOrdered", keywords: ["ol", "number", "nomor"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: "To-do List", desc: "Checklist tugas", icon: "ListChecks", keywords: ["todo", "task", "check", "checklist"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: "Quote", desc: "Kutipan", icon: "Quote", keywords: ["blockquote", "quote", "kutipan"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: "Code Block", desc: "Blok kode", icon: "Code2", keywords: ["code", "kode", "pre"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: "Divider", desc: "Garis pemisah", icon: "Minus", keywords: ["hr", "divider", "rule", "garis"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

function filterItems(query: string): SlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q))
  );
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.run(editor, range);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => filterItems(query),
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null;
          let wrapper: HTMLDivElement | null = null;

          const position = (rect: DOMRect | null) => {
            if (!wrapper || !rect) return;
            // Fixed to the viewport; flip above the caret if near the bottom.
            const menuH = 320;
            const below = rect.bottom + menuH < window.innerHeight;
            wrapper.style.left = `${rect.left}px`;
            wrapper.style.top = below ? `${rect.bottom + 6}px` : `${rect.top - 6}px`;
            wrapper.style.transform = below ? "none" : "translateY(-100%)";
          };

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
              });
              wrapper = document.createElement("div");
              wrapper.style.position = "fixed";
              wrapper.style.zIndex = "80";
              wrapper.appendChild(component.element);
              document.body.appendChild(wrapper);
              position(props.clientRect?.() ?? null);
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              position(props.clientRect?.() ?? null);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                wrapper?.remove();
                wrapper = null;
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              wrapper?.remove();
              component?.destroy();
              wrapper = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
