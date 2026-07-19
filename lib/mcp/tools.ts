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

  // ---- Write tools (require the matching scope on the key/token) ----

  server.registerTool(
    "storage_rename_file",
    {
      description:
        "Rename a file. Requires the 'write' scope. Returns 403 if the key lacks it.",
      inputSchema: z.object({
        fileId: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
    },
    async ({ fileId, name }) => {
      try {
        return toolResult(
          await client.patch("/api/files", { id: fileId, action: "rename", name })
        );
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Rename failed");
      }
    }
  );

  server.registerTool(
    "storage_move_file",
    {
      description:
        "Move a file into a folder (or to the root when folderId is omitted). Requires 'write' scope.",
      inputSchema: z.object({
        fileId: z.string().uuid(),
        folderId: z.string().uuid().nullable().optional().describe("Destination folder, or null for root"),
      }),
    },
    async ({ fileId, folderId }) => {
      try {
        return toolResult(
          await client.patch("/api/files", {
            id: fileId,
            action: "move",
            folderId: folderId ?? null,
          })
        );
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Move failed");
      }
    }
  );

  server.registerTool(
    "storage_favorite_file",
    {
      description: "Toggle the favorite flag on a file. Requires 'write' scope.",
      inputSchema: z.object({
        fileId: z.string().uuid(),
      }),
    },
    async ({ fileId }) => {
      try {
        return toolResult(
          await client.patch("/api/files", { id: fileId, action: "favorite" })
        );
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Favorite failed");
      }
    }
  );

  server.registerTool(
    "storage_update_note",
    {
      description:
        "Replace the body of a .note file with new content (Tiptap/ProseMirror JSON document). Requires 'write' scope.",
      inputSchema: z.object({
        fileId: z.string().uuid(),
        content: z
          .record(z.string(), z.unknown())
          .describe("Tiptap JSON document, e.g. { type: 'doc', content: [...] }"),
      }),
    },
    async ({ fileId, content }) => {
      try {
        return toolResult(await client.put(`/api/files/${fileId}`, { content }));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Update note failed");
      }
    }
  );

  server.registerTool(
    "storage_restore_file",
    {
      description: "Restore a file from the recycle bin. Requires 'write' scope.",
      inputSchema: z.object({
        fileId: z.string().uuid(),
      }),
    },
    async ({ fileId }) => {
      try {
        return toolResult(
          await client.patch("/api/files", { id: fileId, action: "restore" })
        );
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Restore failed");
      }
    }
  );

  server.registerTool(
    "storage_delete_file",
    {
      description:
        "Delete a file. By default moves it to the recycle bin; pass permanent=true to erase it forever (only works if already in the bin). Requires 'delete' scope.",
      inputSchema: z.object({
        fileId: z.string().uuid(),
        permanent: z.boolean().optional().describe("Permanently erase (must already be in recycle bin)"),
      }),
    },
    async ({ fileId, permanent }) => {
      try {
        return toolResult(
          await client.del("/api/files", { id: fileId, permanent: permanent ?? false })
        );
      } catch (e) {
        return toolError(e instanceof Error ? e.message : "Delete failed");
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
