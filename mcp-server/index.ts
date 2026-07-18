#!/usr/bin/env node
/**
 * Storage ByAFR — MCP Server (stdio)
 * Run: npm run mcp
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StorageApiClient } from "@/lib/mcp/api-client";
import { createStorageMcpServer } from "@/lib/mcp/create-server";

async function main() {
  const client = StorageApiClient.fromEnv();
  const server = createStorageMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Storage ByAFR MCP server running (stdio)");
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
