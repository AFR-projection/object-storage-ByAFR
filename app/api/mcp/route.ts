import { handleMcpHttpRequest } from "@/lib/mcp/http-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleMcpHttpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpHttpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpHttpRequest(request);
}

export async function OPTIONS(request: Request) {
  return handleMcpHttpRequest(request);
}
