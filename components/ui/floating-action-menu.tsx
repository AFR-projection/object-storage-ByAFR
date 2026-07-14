"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type FloatingMenuItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  onClick: () => void;
};

type FloatingActionMenuProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  items: FloatingMenuItem[];
  align?: "start" | "end" | "center";
};

const MENU_MIN_W = 188;
const ITEM_H = 40;
const PAD = 8;
const GAP = 6;

function computePosition(
  anchor: DOMRect,
  menuW: number,
  menuH: number,
  align: "start" | "end" | "center"
) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = anchor.top - menuH - GAP;
  if (top < PAD) {
    top = anchor.bottom + GAP;
  }
  if (top + menuH > vh - PAD) {
    top = Math.max(PAD, anchor.top - menuH - GAP);
  }

  let left: number;
  if (align === "start") left = anchor.left;
  else if (align === "center") left = anchor.left + anchor.width / 2 - menuW / 2;
  else left = anchor.right - menuW;

  if (left + menuW > vw - PAD) left = vw - menuW - PAD;
  if (left < PAD) left = PAD;

  return { top, left };
}

export function FloatingActionMenu({
  open,
  onClose,
  anchorRef,
  items,
  align = "end",
}: FloatingActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: -9999, left: -9999 });
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setReady(false);
      return;
    }

    const anchor = anchorRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuW = menuEl?.offsetWidth ?? MENU_MIN_W;
    const menuH = menuEl?.offsetHeight ?? items.length * ITEM_H + 8;

    setCoords(computePosition(anchor, menuW, menuH, align));
    setReady(true);
  }, [open, anchorRef, items, align]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Actions"
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: ready ? 1 : 0, scale: ready ? 1 : 0.96, y: ready ? 0 : 6 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              visibility: ready ? "visible" : "hidden",
            }}
            className="z-[100] w-[min(calc(100vw-16px),220px)] rounded-xl border border-border/60 bg-surface-elevated/95 backdrop-blur-xl shadow-2xl overflow-hidden py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              const showDivider = item.danger && i > 0 && !items[i - 1]?.danger;

              return (
                <div key={item.id}>
                  {showDivider && <div className="my-1 mx-2 border-t border-border/40" />}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onClick();
                      onClose();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors text-left",
                      item.danger
                        ? "text-danger hover:bg-danger/10"
                        : "text-foreground hover:bg-accent/10"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", item.danger ? "opacity-90" : "opacity-60")} />
                    <span className="flex-1 truncate">{item.label}</span>
                  </button>
                </div>
              );
            })}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function useFloatingMenu() {
  const [openId, setOpenId] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return {
    openId,
    setOpenId,
    anchorRef,
    isOpen: (id: string) => openId === id,
    toggle: (id: string) => setOpenId((prev) => (prev === id ? null : id)),
    close: () => setOpenId(null),
  };
}
