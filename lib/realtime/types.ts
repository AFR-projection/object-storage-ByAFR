export type RealtimeEvent =
  | { type: "upload_complete"; fileId: string; name: string; sizeBytes?: number }
  | {
      type: "share_access";
      shareId: string;
      fileName: string;
      accessCount: number;
      token?: string;
    }
  | {
      type: "session_revoked";
      sessionId?: string;
      reason?: string;
      wasCurrent?: boolean;
    }
  | { type: "heartbeat"; at: number };

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

/**
 * Broadcast events for the admin panel (channel `realtime:admin`). These are
 * intentionally minimal "something changed, refetch" signals — the admin list
 * API stays the single source of truth, so the client just invalidates its
 * query when one arrives (no per-event state patching → no drift).
 */
export type AdminRealtimeEvent =
  | { type: "user_registered"; userId: string; at: number }
  | { type: "user_verified"; userId: string; at: number }
  | { type: "user_updated"; userId: string; at: number }
  | { type: "user_deleted"; userId: string; at: number }
  | { type: "user_presence"; userId: string; online: boolean; at: number }
  | { type: "heartbeat"; at: number };

export type AdminRealtimeEventHandler = (event: AdminRealtimeEvent) => void;
