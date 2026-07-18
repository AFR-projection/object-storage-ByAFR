import { appPublicUrl } from "@/lib/env/runtime";
import { OAUTH_SCOPES, oauthBaseUrl, mcpResourceUrl } from "@/lib/oauth/constants";

export function getOAuthIssuer(fallbackOrigin?: string): string {
  return appPublicUrl() || oauthBaseUrl(fallbackOrigin);
}

export function buildAuthorizationServerMetadata(fallbackOrigin?: string) {
  const base = getOAuthIssuer(fallbackOrigin);
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: [...OAUTH_SCOPES],
  };
}

export function buildProtectedResourceMetadata(fallbackOrigin?: string) {
  const base = getOAuthIssuer(fallbackOrigin);
  return {
    resource: mcpResourceUrl(base),
    authorization_servers: [base],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  };
}

export function buildWwwAuthenticateHeader(fallbackOrigin?: string): string {
  const base = getOAuthIssuer(fallbackOrigin);
  const resourceMeta = `${base}/.well-known/oauth-protected-resource/api/mcp`;
  return `Bearer realm="Storage ByAFR", resource_metadata="${resourceMeta}"`;
}
