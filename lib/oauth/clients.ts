import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthClients } from "@/lib/db/schema";
import {
  generateClientId,
  generateClientSecret,
  hashSecret,
  isAllowedRedirectUri,
  LOOPBACK_HOSTS,
} from "@/lib/oauth/constants";

export type RegisterClientInput = {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
};

export type RegisterClientResult = {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
};

export async function registerOAuthClient(input: RegisterClientInput): Promise<RegisterClientResult> {
  if (!input.redirect_uris?.length) {
    throw new OAuthClientError("redirect_uris required", 400);
  }

  for (const uri of input.redirect_uris) {
    if (!isAllowedRedirectUri(uri)) {
      throw new OAuthClientError(`Invalid redirect_uri: ${uri}`, 400);
    }
  }

  const authMethod = input.token_endpoint_auth_method ?? "none";
  const clientId = generateClientId();
  let clientSecret: string | undefined;
  let clientSecretHash: string | null = null;

  if (authMethod === "client_secret_post") {
    clientSecret = generateClientSecret();
    clientSecretHash = hashSecret(clientSecret);
  }

  await db.insert(oauthClients).values({
    clientId,
    clientSecretHash,
    clientName: input.client_name ?? null,
    redirectUris: input.redirect_uris,
    grantTypes: input.grant_types ?? ["authorization_code", "refresh_token"],
    responseTypes: input.response_types ?? ["code"],
    tokenEndpointAuthMethod: authMethod,
  });

  return {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: input.client_name,
    redirect_uris: input.redirect_uris,
    grant_types: input.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: input.response_types ?? ["code"],
    token_endpoint_auth_method: authMethod,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

export async function getOAuthClient(clientId: string) {
  const [row] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  return row ?? null;
}

export async function validateOAuthClientRedirect(
  clientId: string,
  redirectUri: string
): Promise<{ ok: true; client: NonNullable<Awaited<ReturnType<typeof getOAuthClient>>> } | { ok: false; error: string }> {
  const client = await getOAuthClient(clientId);
  if (!client) return { ok: false, error: "invalid_client" };
  if (!isAllowedRedirectUri(redirectUri)) {
    return { ok: false, error: "invalid_redirect_uri" };
  }
  if (redirectUriAllowedForClient(client.redirectUris, redirectUri)) {
    return { ok: true, client };
  }
  return { ok: false, error: "invalid_redirect_uri" };
}

/**
 * Exact-match, with one RFC 8252 exception: loopback redirects (http://127.0.0.1,
 * http://localhost, http://[::1]) may differ only by port, because native clients
 * bind an ephemeral port at runtime. Everything else must match byte-for-byte —
 * no host-only matching (that would allow open redirects within a trusted host).
 */
function redirectUriAllowedForClient(registeredUris: string[], redirectUri: string): boolean {
  if (registeredUris.includes(redirectUri)) return true;

  let requested: URL;
  try {
    requested = new URL(redirectUri);
  } catch {
    return false;
  }

  const isLoopback =
    requested.protocol === "http:" &&
    LOOPBACK_HOSTS.includes(requested.hostname.toLowerCase());
  if (!isLoopback) return false;

  // Loopback: match on everything except the port.
  return registeredUris.some((registered) => {
    let reg: URL;
    try {
      reg = new URL(registered);
    } catch {
      return false;
    }
    return (
      reg.protocol === "http:" &&
      LOOPBACK_HOSTS.includes(reg.hostname.toLowerCase()) &&
      reg.hostname.toLowerCase() === requested.hostname.toLowerCase() &&
      reg.pathname === requested.pathname
    );
  });
}

export class OAuthClientError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
