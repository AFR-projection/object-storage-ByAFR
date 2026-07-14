"use client";

export type NotifyTone = "info" | "success" | "warning" | "error" | "system";

export type ConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline"
  | "idle";

export type SystemNotice = {
  id: string;
  title: string;
  description?: string;
  tone: NotifyTone;
  duration: number;
  createdAt: number;
};

type Listener = () => void;

type NotifyInput = {
  title: string;
  description?: string;
  tone?: NotifyTone;
  duration?: number;
};

const MAX_TOASTS = 4;

/** Stable empty snapshot for useSyncExternalStore getServerSnapshot (never allocate a new []). */
export const EMPTY_NOTICES: readonly SystemNotice[] = Object.freeze([]);

let notices: SystemNotice[] = [];
let connection: ConnectionStatus = "idle";
let navBusy = false;
let apiBusyCount = 0;

const noticeListeners = new Set<Listener>();
const connectionListeners = new Set<Listener>();
const busyListeners = new Set<Listener>();

function emit(set: Set<Listener>) {
  set.forEach((l) => l());
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getSystemNotices() {
  return notices;
}

export function subscribeSystemNotices(listener: Listener) {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

export function notify(input: NotifyInput): string {
  const id = uid();
  const notice: SystemNotice = {
    id,
    title: input.title,
    description: input.description,
    tone: input.tone ?? "system",
    duration: input.duration ?? 4200,
    createdAt: Date.now(),
  };
  notices = [notice, ...notices].slice(0, MAX_TOASTS);
  emit(noticeListeners);

  if (notice.duration > 0) {
    window.setTimeout(() => dismissNotice(id), notice.duration);
  }
  return id;
}

export function dismissNotice(id: string) {
  const next = notices.filter((n) => n.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emit(noticeListeners);
}

export function getConnectionStatus() {
  return connection;
}

export function subscribeConnectionStatus(listener: Listener) {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

export function setConnectionStatus(status: ConnectionStatus) {
  if (connection === status) return;
  connection = status;
  emit(connectionListeners);
}

export function getSystemBusy() {
  return navBusy || apiBusyCount > 0;
}

export function subscribeSystemBusy(listener: Listener) {
  busyListeners.add(listener);
  return () => {
    busyListeners.delete(listener);
  };
}

export function setNavigationBusy(busy: boolean) {
  if (navBusy === busy) return;
  navBusy = busy;
  emit(busyListeners);
}

export function beginApiBusy() {
  apiBusyCount += 1;
  emit(busyListeners);
}

export function endApiBusy() {
  apiBusyCount = Math.max(0, apiBusyCount - 1);
  emit(busyListeners);
}

/** Compatibility helper used by older call sites. */
export function showSystemToast(message: string, durationMs = 4200) {
  notify({ title: message, tone: "system", duration: durationMs });
}
