import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StorageApiClient, toolError, toolResult } from "@/lib/mcp/api-client";

export function registerStorageMcpTools(server: McpServer, client: StorageApiClient): void {
  server.registerTool(
    "storage_verify",
    {
      description:
        "Verify API key connection and inspect account, tier (standard/master), and granted scopes.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toolResult(await client.get("/api/v1/me"));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Verify failed");
      }
    }
  );

  server.registerTool(
    "storage_list_files",
    {
      description: "List files in storage. Supports folder filter and pagination.",
      inputSchema: z.object({
        folderId: z.string().uuid().optional().describe("Filter by folder UUID"),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    },
    async ({ folderId, limit, cursor }) => {
      try {
        const params = new URLSearchParams();
        if (folderId) params.set("folderId", folderId);
        if (limit) params.set("limit", String(limit));
        if (cursor) params.set("cursor", cursor);
        const qs = params.toString();
        return toolResult(await client.get(`/api/files${qs ? `?${qs}` : ""}`));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "List files failed");
      }
    }
  );

  server.registerTool(
    "storage_search",
    {
      description: "Search files by name, note content, or mime type.",
      inputSchema: z.object({
        q: z.string().optional(),
        mimeType: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ q, mimeType, limit }) => {
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (mimeType) params.set("mimeType", mimeType);
        if (limit) params.set("limit", String(limit));
        return toolResult(await client.get(`/api/search?${params.toString()}`));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Search failed");
      }
    }
  );

  server.registerTool(
    "storage_list_folders",
    {
      description: "List accessible folders.",
      inputSchema: z.object({
        parentId: z.string().uuid().optional(),
      }),
    },
    async ({ parentId }) => {
      try {
        const params = parentId ? `?parentId=${parentId}` : "";
        return toolResult(await client.get(`/api/folders${params}`));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "List folders failed");
      }
    }
  );

  server.registerTool(
    "storage_get_file",
    {
      description: "Get file metadata and note content by file ID.",
      inputSchema: z.object({
        fileId: z.string().uuid(),
      }),
    },
    async ({ fileId }) => {
      try {
        return toolResult(await client.get(`/api/files/${fileId}`));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Get file failed");
      }
    }
  );

  server.registerTool(
    "storage_get_docs",
    {
      description: "Get machine-readable API documentation.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toolResult(await client.get("/api/v1/docs"));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Get docs failed");
      }
    }
  );

  server.registerTool(
    "admin_get_stats",
    {
      description: "Platform statistics (master key: admin:stats or supreme).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toolResult(await client.get("/api/admin/stats"));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Admin stats failed");
      }
    }
  );

  server.registerTool(
    "admin_list_users",
    {
      description: "List all users (master key: admin:users or supreme).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toolResult(await client.get("/api/admin/users"));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Admin list users failed");
      }
    }
  );

  server.registerTool(
    "admin_get_settings",
    {
      description: "Read platform settings (master key: admin:settings or supreme).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toolResult(await client.get("/api/admin/settings"));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Admin settings failed");
      }
    }
  );
}
