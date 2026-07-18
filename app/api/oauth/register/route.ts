import { registerOAuthClient, OAuthClientError } from "@/lib/oauth/clients";
import { oauthError, oauthJson } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      client_name?: string;
      redirect_uris?: string[];
      grant_types?: string[];
      response_types?: string[];
      token_endpoint_auth_method?: string;
    };

    const result = await registerOAuthClient({
      client_name: body.client_name,
      redirect_uris: body.redirect_uris ?? [],
      grant_types: body.grant_types,
      response_types: body.response_types,
      token_endpoint_auth_method: body.token_endpoint_auth_method ?? "none",
    });

    return oauthJson(result, 201, {
      "Access-Control-Allow-Origin": "*",
    });
  } catch (e) {
    if (e instanceof OAuthClientError) {
      return oauthError("invalid_client_metadata", e.message, e.status);
    }
    return oauthError("server_error", e instanceof Error ? e.message : "Registration failed", 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
