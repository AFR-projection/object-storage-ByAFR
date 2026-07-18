"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";

export default function OAuthConsentClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const oauth = useMemo(
    () => ({
      client_id: params.get("client_id") ?? "",
      redirect_uri: params.get("redirect_uri") ?? "",
      scope: params.get("scope") ?? "read",
      state: params.get("state") ?? "",
      code_challenge: params.get("code_challenge") ?? "",
      code_challenge_method: params.get("code_challenge_method") ?? "S256",
    }),
    [params]
  );

  async function handleApprove() {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ redirect_to: string }>("/api/oauth/approve", {
        method: "POST",
        body: JSON.stringify(oauth),
      });
      if (!res.success || !res.data?.redirect_to) {
        setError(res.error ?? "Authorization failed");
        return;
      }
      window.location.href = res.data.redirect_to;
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  if (!oauth.client_id || !oauth.redirect_uri || !oauth.code_challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md p-6 text-sm text-muted-foreground">
          Invalid OAuth request. Missing client_id, redirect_uri, or PKCE challenge.
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-violet-400" />
          <h1 className="text-lg font-semibold">Authorize connection</h1>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          External app (MCP client) minta akses ke Storage ByAFR pakai akun login kamu.
        </p>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs space-y-1">
          <p>
            <span className="text-muted-foreground">Client:</span>{" "}
            <code className="break-all">{oauth.client_id}</code>
          </p>
          <p>
            <span className="text-muted-foreground">Scopes:</span> {oauth.scope}
          </p>
          <p>
            <span className="text-muted-foreground">Redirect:</span>{" "}
            <span className="break-all">{oauth.redirect_uri}</span>
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleApprove} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Allow access"}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => router.push("/dashboard")} disabled={loading}>
            Cancel
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Setelah Allow, kamu di-redirect kembali ke app connector. Token OAuth dipakai untuk MCP — bukan API key
          sk_.
        </p>
      </Card>
    </div>
  );
}
