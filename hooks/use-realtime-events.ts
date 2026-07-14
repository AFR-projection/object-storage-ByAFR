"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "@/lib/realtime/types";
import { notify, setConnectionStatus, showSystemToast } from "@/lib/system/notify-store";

/** @deprecated Prefer `notify()` — kept for call-site compatibility. */
export function showRealtimeToast(message: string, durationMs = 4200): void {
  showSystemToast(message, durationMs);
}

function toastForEvent(event: RealtimeEvent): { title: string; description?: string; tone?: "info" | "success" | "warning" | "system" } | null {
  switch (event.type) {
    case "upload_complete":
      return {
        title: "Upload complete",
        description: event.name,
        tone: "success",
      };
    case "share_access":
      return {
        title: "Share accessed",
        description: event.fileName,
        tone: "info",
      };
    case "session_revoked":
      return {
        title: "Session updated",
        description:
          event.reason === "revoke_others"
            ? "Other devices were signed out"
            : event.reason === "revoke_all"
              ? "All sessions were revoked"
              : "A session was revoked",
        tone: "warning",
      };
    case "heartbeat":
      return null;
    default:
      return null;
  }
}

/**
 * Connects to GET /api/events (SSE) while authenticated.
 * Updates connection status + elegant system toasts.
 */
export function useRealtimeEvents(enabled = true): void {
  const attemptRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcedLive = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      clearTimer();

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setConnectionStatus("offline");
        return;
      }

      setConnectionStatus(attemptRef.current > 0 ? "reconnecting" : "connecting");

      const es = new EventSource("/api/events");
      esRef.current = es;

      es.onopen = () => {
        const wasReconnect = attemptRef.current > 0;
        attemptRef.current = 0;
        setConnectionStatus("live");
        if (wasReconnect || !announcedLive.current) {
          announcedLive.current = true;
          if (wasReconnect) {
            notify({
              title: "Reconnected",
              description: "Live updates are back.",
              tone: "success",
              duration: 2800,
            });
          }
        }
      };

      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as RealtimeEvent;
          const text = toastForEvent(event);
          if (text) {
            notify({
              title: text.title,
              description: text.description,
              tone: text.tone ?? "system",
            });
          }
        } catch {
          // ignore malformed
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (cancelled) return;

        attemptRef.current += 1;
        setConnectionStatus(
          typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting"
        );
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attemptRef.current, 5));
        timerRef.current = setTimeout(connect, delay);
      };
    };

    const onOnline = () => {
      if (cancelled) return;
      attemptRef.current = Math.max(attemptRef.current, 1);
      connect();
    };

    window.addEventListener("online", onOnline);
    connect();

    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener("online", onOnline);
      esRef.current?.close();
      esRef.current = null;
      setConnectionStatus("idle");
    };
  }, [enabled]);
}
