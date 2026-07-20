"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [waitTimer, setWaitTimer] = useState(60);

  useEffect(() => {
    if (waitTimer <= 0) return;
    const timer = setTimeout(() => setWaitTimer((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitTimer]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const res = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, code: otp }),
      });
      if (!res.success) {
        setError(res.error ?? "Verification failed");
        setOtp("");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Connection failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResending(true);
    setWaitTimer(60);
    try {
      const res = await apiFetch("/api/auth/resend-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (!res.success) {
        setError(res.error ?? "Failed to resend code");
        setWaitTimer(0);
      }
    } catch {
      setError("Connection failed");
      setWaitTimer(0);
    } finally {
      setResending(false);
    }
  };

  if (!email) return null;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md px-4"
      >
        <div className="rounded-2xl border border-border/60 bg-surface/70 px-8 py-10 shadow-xl backdrop-blur-2xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent shadow-lg shadow-accent/20">
              <Mail className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gradient">Verify your email</h1>
            <p className="mt-2 text-sm text-muted-foreground/80">{email}</p>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                We sent a 6-digit code to your email. Enter it below to activate your account.
                Check your spam folder if you don&apos;t see it.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Verification Code</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="h-11 text-center text-2xl tracking-widest font-mono"
                disabled={verifying}
                autoFocus
              />
              <p className="mt-1 text-xs text-muted-foreground">Code is valid for 10 minutes</p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
            )}

            <Button type="submit" className="h-11 w-full" disabled={verifying || otp.length !== 6}>
              {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Verify"}
            </Button>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">Didn&apos;t receive the code?</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={waitTimer > 0 || resending}
                className="text-accent hover:text-accent/80"
              >
                {resending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : waitTimer > 0 ? (
                  `Wait ${waitTimer}s`
                ) : (
                  "Resend"
                )}
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
