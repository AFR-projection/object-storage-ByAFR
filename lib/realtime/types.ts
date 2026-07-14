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
