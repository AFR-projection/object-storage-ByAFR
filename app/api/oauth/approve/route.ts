import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { validateOAuthClientRedirect } from "@/lib/oauth/clients";
import { createAuthorizationCode } from "@/lib/oauth/codes";
import { parseScopes } from "@/lib/oauth/constants";
import { oauthError } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const clientId = String(body.client_id ?? "");
    const redirectUri = String(body.redirect_uri ?? "");
    const scope = String(body.scope ?? "read");
    const state = body.state ? String(body.state) : "";
    const codeChallenge = String(body.code_challenge ?? "");
    const codeChallengeMethod = String(body.code_challenge_method ?? "S256");

    if (!clientId || !redirectUri || !codeChallenge) {
      return oauthError("invalid_request", "Missing required parameters");
    }

    const clientCheck = await validateOAuthClientRedirect(clientId, redirectUri);
    if (!clientCheck.ok) {
      return oauthError(clientCheck.error, undefined, 400);
    }

    const scopes = parseScopes(scope);
    const code = await createAuthorizationCode({
      clientId,
      userId: session.id,
      redirectUri,
      scopes,
      codeChallenge,
      codeChallengeMethod,
    });

    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);

    return Response.json({ redirect_to: redirect.toString() });
  } catch (e) {
    return oauthError("access_denied", e instanceof Error ? e.message : "Unauthorized", 401);
  }
}
