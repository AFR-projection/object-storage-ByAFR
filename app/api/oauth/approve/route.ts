import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { validateOAuthClientRedirect } from "@/lib/oauth/clients";
import { createAuthorizationCode } from "@/lib/oauth/codes";
import { parseScopes, clampScopesToRole } from "@/lib/oauth/constants";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { validateCsrf } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) {
      return apiError("Invalid CSRF token", 403);
    }

    const session = await requireAuth();
    const body = await request.json();
    const clientId = String(body.client_id ?? "");
    const redirectUri = String(body.redirect_uri ?? "");
    const scope = String(body.scope ?? "read");
    const state = body.state ? String(body.state) : "";
    const codeChallenge = String(body.code_challenge ?? "");
    const codeChallengeMethod = String(body.code_challenge_method ?? "S256");

    if (!clientId || !redirectUri || !codeChallenge) {
      return apiError("Missing required OAuth parameters", 400);
    }

    const clientCheck = await validateOAuthClientRedirect(clientId, redirectUri);
    if (!clientCheck.ok) {
      return apiError(
        clientCheck.error === "invalid_redirect_uri"
          ? "Redirect URI does not match the OAuth client"
          : "Invalid OAuth client",
        400
      );
    }

    const requestedScopes = parseScopes(scope);
    // SECURITY: never trust the requested scope set. Clamp to what this account's
    // role is allowed to hold — a non-master user can never be granted admin:* /
    // supreme, even if the client asked and the user clicked Allow.
    const scopes = clampScopesToRole(requestedScopes, session.role);
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

    return apiSuccess({ redirect_to: redirect.toString() });
  } catch (e) {
    return handleApiError(e);
  }
}
