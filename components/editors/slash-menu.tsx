"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { Editor, Range } from "@tiptap/core";
import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered,
  ListChecks, Quote, Code2, Minus,
} from "lucide-react";

const ICONS = {
  Type, Heading1, Heading2, Heading3, List, ListOrdered,
  ListChecks, Quote, Code2, Minus,
} as const;

export type SlashItem = {
  title: string;
  desc: string;
  icon: keyof typeof ICONS;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

export type SlashMenuRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type SlashMenuProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
};

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(
  function SlashMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    // Reset highlight whenever the filtered list changes.
    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-64 rounded-xl border border-border/60 bg-card/95 p-3 text-xs text-muted-foreground shadow-2xl backdrop-blur-xl">
          Tidak ada blok yang cocok
        </div>
      );
    }

    return (
      <div className="max-h-80 w-64 overflow-y-auto rounded-xl border border-border/60 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl">
        {items.map((item, i) => {
          const Icon = ICONS[item.icon];
          const active = i === selected;
          return (
            <button
              key={item.title}
              type="button"
              onMouseEnter={() => setSelected(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                command(item);
              }}
              className={[
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                active ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:bg-muted/40",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                  active ? "border-accent/40 bg-accent/10 text-accent" : "border-border/50 bg-muted/30",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight text-foreground">{item.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{item.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }
);
