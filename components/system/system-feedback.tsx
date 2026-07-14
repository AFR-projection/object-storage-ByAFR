"use client";

import { useEffect } from "react";
import { SystemToastViewport } from "./system-toast";
import { ConnectionStatusPill } from "./connection-status";
import { PageProgressBar } from "./page-progress";
import { notify, setConnectionStatus } from "@/lib/system/notify-store";

/** Global system feedback layer: progress, connection, toasts, online/offline. */
export function SystemFeedback() {
  useEffect(() => {
    const onOffline = () => {
      setConnectionStatus("offline");
      notify({
        title: "You're offline",
        description: "Some actions will retry when connection returns.",
        tone: "warning",
        duration: 5000,
      });
    };
    const onOnline = () => {
      setConnectionStatus("connecting");
      notify({
        title: "Back online",
        description: "Reconnecting to live updates…",
        tone: "success",
        duration: 2800,
      });
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setConnectionStatus("offline");
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return (
    <>
      <PageProgressBar />
      <ConnectionStatusPill />
      <SystemToastViewport />
    </>
  );
}
