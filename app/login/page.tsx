"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cloud, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = pendingToken
        ? {
            pendingToken,
            totpCode: useRecovery ? undefined : totpCode,
            recoveryCode: useRecovery ? totpCode : undefined,
          }
        : { identifier, password };

      const res = await apiFetch<{
        user?: unknown;
        requires2fa?: boolean;
        pendingToken?: string;
        mustChangePassword?: boolean;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.success) {
        setError(res.error ?? "Login failed");
        return;
      }

      if (res.data?.requires2fa && res.data.pendingToken) {
        setPendingToken(res.data.pendingToken);
        setTotpCode("");
        setUseRecovery(false);
        return;
      }

      if (res.data?.mustChangePassword) {
        router.push("/change-password");
        router.refresh();
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-16 -top-16 h-80 w-80 rounded-full bg-accent/8 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-20 top-1/3 h-96 w-96 rounded-full bg-accent/5 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, 20, 0], y: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-accent/6 blur-3xl"
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative w-full max-w-md px-4"
      >
        <div className="relative rounded-2xl border border-border/60 bg-surface/70 px-8 py-10 shadow-xl backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-accent-gradient opacity-[0.04] blur-[2px]" />

          <div className="relative mb-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.15 }}
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent shadow-lg shadow-accent/20"
            >
              <Cloud className="h-8 w-8 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold tracking-tight text-gradient">Storage ByAFR</h1>
            <p className="mt-2 text-sm text-muted-foreground/80">
              {pendingToken ? "Two-factor authentication" : "Sign in to your account"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="relative space-y-5">
            {!pendingToken ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground/80">
                    Username / Email
                  </label>
                  <Input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="your@email.com"
                    autoComplete="username"
                    required
                    className="h-11"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground/80">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Enter the 6-digit code from your authenticator app
                  {useRecovery ? " or a recovery code" : ""}.
                </p>
                <Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder={useRecovery ? "Recovery code" : "000000"}
                  autoComplete="one-time-code"
                  inputMode={useRecovery ? "text" : "numeric"}
                  required
                  className="h-11 text-center font-mono text-lg tracking-widest"
                />
                <div className="mt-2 flex justify-between text-xs">
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => {
                      setUseRecovery(!useRecovery);
                      setTotpCode("");
                    }}
                  >
                    {useRecovery ? "Use authenticator code" : "Use recovery code"}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={() => {
                      setPendingToken(null);
                      setTotpCode("");
                    }}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" className="h-11 w-full text-base font-semibold" disabled={loading}>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : pendingToken ? (
                "Verify"
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/40">
          Secure cloud storage platform
        </p>
      </motion.div>
    </div>
  );
}
