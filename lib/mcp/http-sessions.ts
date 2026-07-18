import { randomUUID } from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createStorageMcpServer } from "@/lib/mcp/create-server";
import { StorageApiClient } from "@/lib/mcp/api-client";
import type { SessionUserFromApiKey } from "@/lib/auth/api-key";

const SESSION_TTL_MS = 24 * 60 * 60_000;
const MAX_SESSIONS_PER_KEY = 5;
const MAX_TOTAL_SESSIONS = 500;

export type McpSession = {
  id: string;
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  apiKeyId: string;
  userId: string;
  tier: "standard" | "master";
  createdAt: number;
  lastUsedAt: number;
};

const sessions = new Map<string, McpSession>();
const sessionsByKeyId = new Map<string, Set<string>>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      void session.transport.close().catch(() => {});
      sessions.delete(id);
      sessionsByKeyId.get(session.apiKeyId)?.delete(id);
    }
  }
}

function enforceLimits(apiKeyId: string): void {
  const keySessions = sessionsByKeyId.get(apiKeyId);
  if (keySessions && keySessions.size >= MAX_SESSIONS_PER_KEY) {
    const oldest = [...keySessions]
      .map((id) => sessions.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.createdAt - b!.createdAt)[0];
    if (oldest) void destroyMcpSession(oldest.id);
  }
  if (sessions.size >= MAX_TOTAL_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
    if (oldest) void destroyMcpSession(oldest.id);
  }
}

export function getMcpSession(sessionId: string): McpSession | undefined {
  pruneExpired();
  const session = sessions.get(sessionId);
  if (session) session.lastUsedAt = Date.now();
  return session;
}

export async function createMcpSessionPair(
  baseUrl: string,
  apiKey: string,
  user: SessionUserFromApiKey
): Promise<{ transport: WebStandardStreamableHTTPServerTransport; server: McpServer }> {
  pruneExpired();
  enforceLimits(user.apiKeyId);

  const client = StorageApiClient.fromKey(baseUrl, apiKey);
  const server = createStorageMcpServer(client);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      const session: McpSession = {
        id,
        transport,
        server,
        apiKeyId: user.apiKeyId,
        userId: user.id,
        tier: user.apiKeyTier,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };
      sessions.set(id, session);
      if (!sessionsByKeyId.has(user.apiKeyId)) {
        sessionsByKeyId.set(user.apiKeyId, new Set());
      }
      sessionsByKeyId.get(user.apiKeyId)!.add(id);
    },
    onsessionclosed: (id) => {
      void destroyMcpSession(id);
    },
  });

  await server.connect(transport);
  return { transport, server };
}

export async function destroyMcpSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  sessionsByKeyId.get(session.apiKeyId)?.delete(sessionId);
  await session.transport.close().catch(() => {});
}

export function mcpSessionStats() {
  pruneExpired();
  return { active: sessions.size };
}
