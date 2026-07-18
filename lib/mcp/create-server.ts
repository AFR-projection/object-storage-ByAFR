import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StorageApiClient } from "@/lib/mcp/api-client";
import { registerStorageMcpTools } from "@/lib/mcp/tools";

export function createStorageMcpServer(client: StorageApiClient): McpServer {
  const server = new McpServer({
    name: "storage-by-afr",
    version: "1.0.0",
  });
  registerStorageMcpTools(server, client);
  return server;
}
