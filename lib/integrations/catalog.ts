import { appPublicUrl } from "@/lib/env/runtime";

export type ConnectionMethodId = "api" | "mcp" | "webhooks" | "openapi";

export type ConnectionMethod = {
  id: ConnectionMethodId;
  name: string;
  subtitle: string;
  description: string;
  /** Protocol/standard requirements — any platform that meets these can connect */
  compatibility: string[];
  docsPath?: string;
  settingsPath?: string;
  tier: "user" | "master" | "both";
};

export const CONNECTION_METHODS: ConnectionMethod[] = [
  {
    id: "api",
    name: "REST API",
    subtitle: "API Keys (sk_ / skm_)",
    description:
      "Standar HTTP + Bearer token. Semua platform, bahasa, bot, atau automation yang bisa kirim request HTTPS bisa connect — tanpa plugin khusus.",
    compatibility: [
      "HTTPS + JSON REST",
      "Authorization: Bearer sk_* / skm_*",
      "Semua bahasa & runtime (Node, Python, Go, PHP, …)",
      "Semua automation yang punya HTTP node",
    ],
    docsPath: "/api/v1/docs",
    settingsPath: "/settings",
    tier: "both",
  },
  {
    id: "mcp",
    name: "MCP",
    subtitle: "Model Context Protocol",
    description:
      "Protokol MCP resmi — local stdio (npm run mcp) atau remote Streamable HTTP (/api/mcp). Semua client MCP yang support transport tersebut bisa connect dengan API key sendiri.",
    compatibility: [
      "MCP client dengan stdio transport (local)",
      "MCP client dengan Streamable HTTP (remote)",
      "Bearer API key (sk_* / skm_*)",
      "Semua AI agent / IDE yang support MCP",
    ],
    tier: "both",
  },
  {
    id: "webhooks",
    name: "Webhooks",
    subtitle: "Event-driven outbound",
    description:
      "Platform kamu kirim event (upload, delete, share) ke URL yang kamu daftarkan. Semua sistem yang bisa terima HTTP POST + verifikasi signature bisa connect.",
    compatibility: [
      "HTTP POST callback URL",
      "JSON payload + HMAC signature",
      "Semua workflow engine & server custom",
    ],
    settingsPath: "/settings",
    tier: "user",
  },
  {
    id: "openapi",
    name: "OpenAPI & Plugins",
    subtitle: "Universal connector spec",
    description:
      "Spesifikasi OpenAPI 3.0 standar industri. Semua tool yang bisa import OpenAPI + Bearer auth otomatis bisa connect — tanpa daftar platform tertentu.",
    compatibility: [
      "OpenAPI 3.0 import",
      "Bearer authentication scheme",
      "Semua API client, low-code, AI action builder",
    ],
    docsPath: "/api/v1/openapi",
    tier: "both",
  },
];

export const WEBHOOK_EVENT_LABELS: Record<string, string> = {
  upload: "File uploaded",
  delete: "File deleted",
  share: "Share link created",
};

export function getIntegrationsBaseUrl(fallbackOrigin?: string): string {
  return appPublicUrl() || fallbackOrigin || "https://your-domain.com";
}

export function methodsForTier(tier: "user" | "master"): ConnectionMethod[] {
  return CONNECTION_METHODS.filter((m) => m.tier === tier || m.tier === "both").map((m) => {
    if (tier === "master" && m.id === "webhooks") {
      return {
        ...m,
        name: "Webhooks",
        description:
          "Master pakai API/MCP untuk kontrol inbound. Webhook outbound dikonfigurasi per akun user di Settings mereka.",
        settingsPath: undefined,
      };
    }
    if (tier === "master" && m.id === "api") {
      return { ...m, settingsPath: "/admin/api-keys" };
    }
    if (tier === "user" && m.id === "api") {
      return { ...m, settingsPath: "/settings" };
    }
    return m;
  });
}
