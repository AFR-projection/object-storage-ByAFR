import { appPublicUrl } from "@/lib/env/runtime";

export type MethodCompatibility = {
  /** What the external platform must support — not a brand list */
  requires: string[];
  transport?: string;
  auth: string;
  setup?: string[];
};

export type ConnectManifest = {
  product: string;
  version: string;
  baseUrl: string;
  philosophy: string;
  auth: {
    type: "bearer";
    header: "Authorization";
    format: "Bearer sk_… | skm_…";
    keyPrefixes: ["sk_", "skm_"];
  };
  endpoints: {
    me: string;
    docs: string;
    openapi: string;
    connect: string;
    mcp: string;
  };
  methods: Array<{
    id: string;
    name: string;
    description: string;
    url?: string;
    compatibility: MethodCompatibility;
  }>;
  security: {
    rateLimitMcpPerMinute: number;
    maxMcpSessionsPerKey: number;
    sessionTtlHours: 24;
    scopes: string[];
    masterScopes: string[];
  };
  mcp: {
    serverName: string;
    transport: {
      local: "stdio";
      remote: "streamable-http";
    };
    remoteUrl: string;
    authHeader: "Authorization: Bearer <api_key>";
    tools: string[];
  };
};

const MCP_TOOLS = [
  "storage_verify",
  "storage_list_files",
  "storage_search",
  "storage_list_folders",
  "storage_get_file",
  "storage_get_docs",
  "admin_get_stats",
  "admin_list_users",
  "admin_get_settings",
];

export function buildConnectManifest(fallbackOrigin?: string): ConnectManifest {
  const baseUrl = (appPublicUrl() || fallbackOrigin || "https://storage.dataku.id").replace(/\/$/, "");

  return {
    product: "Storage ByAFR",
    version: "1.0.0",
    baseUrl,
    philosophy:
      "Platform-agnostic by design. Any external system that supports the listed protocol/standard can connect — no allowlist of vendor names.",
    auth: {
      type: "bearer",
      header: "Authorization",
      format: "Bearer sk_… | skm_…",
      keyPrefixes: ["sk_", "skm_"],
    },
    endpoints: {
      me: `${baseUrl}/api/v1/me`,
      docs: `${baseUrl}/api/v1/docs`,
      openapi: `${baseUrl}/api/v1/openapi`,
      connect: `${baseUrl}/api/v1/connect`,
      mcp: `${baseUrl}/api/mcp`,
    },
    methods: [
      {
        id: "api",
        name: "REST API",
        description: "Universal inbound HTTP API with scoped Bearer keys.",
        compatibility: {
          requires: [
            "HTTPS client",
            "JSON request/response",
            "Authorization: Bearer header",
          ],
          auth: "Bearer sk_* or skm_*",
          setup: [
            "Create API key with required scopes",
            "Send Authorization: Bearer <key> on every request",
            "Discover endpoints via GET /api/v1/docs or /api/v1/me",
          ],
        },
      },
      {
        id: "mcp-local",
        name: "MCP (local stdio)",
        description: "Model Context Protocol over stdio — run npm run mcp with env vars.",
        compatibility: {
          requires: ["MCP client with stdio transport", "Ability to set env vars on child process"],
          transport: "stdio",
          auth: "STORAGE_API_KEY env var (sk_* or skm_*)",
          setup: [
            "Copy MCP config from Integrations page",
            "Paste into your MCP client's server config",
            "Set STORAGE_API_URL and STORAGE_API_KEY",
          ],
        },
      },
      {
        id: "mcp-remote",
        name: "MCP (remote HTTP)",
        description: "Model Context Protocol Streamable HTTP — OAuth 2.1 + PKCE for MCP connectors (ChatGPT, etc.).",
        url: `${baseUrl}/api/mcp`,
        compatibility: {
          requires: [
            "MCP client with Streamable HTTP transport",
            "OAuth 2.1 Authorization Code + PKCE (S256)",
            "Dynamic Client Registration (RFC 7591)",
          ],
          transport: "streamable-http",
          auth: "OAuth 2.1 (browser login) — discovery via /.well-known/oauth-authorization-server",
          setup: [
            "MCP Server URL: /api/mcp (NOT /api/v1/connect or /api/v1/openapi)",
            "Client auto-discovers OAuth — user signs in at storage.dataku.id",
            "After consent, MCP tools run with granted scopes",
          ],
        },
      },
      {
        id: "openapi",
        name: "OpenAPI / Plugin spec",
        description: "Industry-standard OpenAPI 3.0 for automatic client generation and plugin import.",
        url: `${baseUrl}/api/v1/openapi`,
        compatibility: {
          requires: ["OpenAPI 3.0 import support", "Bearer auth configuration in client"],
          auth: "Bearer sk_* or skm_*",
          setup: [
            "Import URL /api/v1/openapi into your tool",
            "Configure Bearer authentication with your API key",
            "Master keys include admin paths in the spec",
          ],
        },
      },
      {
        id: "webhooks",
        name: "Webhooks (outbound)",
        description: "Storage ByAFR pushes events to URLs you register in Settings.",
        compatibility: {
          requires: [
            "Public HTTPS endpoint that accepts POST",
            "JSON body parsing",
            "HMAC signature verification (X-Webhook-Signature)",
          ],
          auth: "Per-webhook secret + HMAC (configured in Settings → Webhooks)",
          setup: [
            "Register callback URL in Settings → Webhooks",
            "Verify signature on incoming payloads",
            "Respond 2xx to acknowledge",
          ],
        },
      },
    ],
    security: {
      rateLimitMcpPerMinute: 120,
      maxMcpSessionsPerKey: 5,
      sessionTtlHours: 24,
      scopes: ["read", "upload", "download", "delete", "write", "full"],
      masterScopes: [
        "supreme",
        "admin",
        "admin:users",
        "admin:settings",
        "admin:stats",
        "admin:monitoring",
        "admin:shares",
        "admin:whatsapp",
      ],
    },
    mcp: {
      serverName: "storage-by-afr",
      transport: { local: "stdio", remote: "streamable-http" },
      remoteUrl: `${baseUrl}/api/mcp`,
      authHeader: "Authorization: Bearer <api_key>",
      tools: MCP_TOOLS,
    },
  };
}
