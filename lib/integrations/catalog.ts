import { appPublicUrl } from "@/lib/env/runtime";

export type ConnectionMethodId = "api" | "mcp" | "webhooks" | "openapi";

export type ConnectionMethod = {
  id: ConnectionMethodId;
  name: string;
  subtitle: string;
  description: string;
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
      "Standard HTTP + Bearer token. Any platform, language, bot, or automation that can send HTTPS requests can connect.",
    compatibility: [
      "HTTPS + JSON REST",
      "Authorization: Bearer sk_* / skm_*",
      "All languages & runtimes",
      "Any automation with an HTTP node",
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
      "Local stdio (npm run mcp + API key) or remote HTTP (/api/mcp + OAuth 2.1). Works with any MCP client that supports the transport and auth model.",
    compatibility: [
      "MCP stdio + API key (local)",
      "MCP Streamable HTTP + OAuth 2.1 PKCE (remote)",
      "Discovery: /.well-known/oauth-authorization-server",
    ],
    tier: "both",
  },
  {
    id: "webhooks",
    name: "Webhooks",
    subtitle: "Event-driven outbound",
    description:
      "Your platform pushes events (upload, delete, share) to URLs you configure. Any system that accepts signed HTTP POST can connect.",
    compatibility: [
      "HTTP POST callback URL",
      "JSON payload + HMAC signature",
      "Workflow engines & custom servers",
    ],
    settingsPath: "/settings",
    tier: "user",
  },
  {
    id: "openapi",
    name: "OpenAPI & Plugins",
    subtitle: "Universal connector spec",
    description:
      "Industry-standard OpenAPI 3.0. Any tool that imports OpenAPI with Bearer auth can connect automatically.",
    compatibility: [
      "OpenAPI 3.0 import",
      "Bearer authentication scheme",
      "API clients, low-code, AI action builders",
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
        description:
          "Master accounts use API/MCP for inbound control. Outbound webhooks are configured per user in Settings.",
        settingsPath: undefined,
      };
    }
    if (m.id === "api") {
      return { ...m, settingsPath: "/connection?section=keys" };
    }
    return m;
  });
}
