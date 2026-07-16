"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Cloud, Loader2, CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";

type Step = "waiting-save" | "waiting-otp" | "verifying";

function VerifyWAContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneNumber = searchParams.get("phone");

  const [step, setStep] = useState<Step>("waiting-save");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [waitTimer, setWaitTimer] = useState(0);

  if (!phoneNumber) {
    return null;
  }

  useEffect(() => {
    const checkVerification = async () => {
      try {
        const res = await apiFetch<{ status: string }>(
          `/api/auth/verify-wa?phone=${encodeURIComponent(phoneNumber)}`
        );
        if (res.data?.status === "otp-sent") {
          setStep("waiting-otp");
        } else if (res.data?.status === "verified") {
          router.push("/dashboard");
        }
      } catch (err) {
        console.error("Check error:", err);
      }
    };

    const interval = setInterval(checkVerification, 3000);
    return () => clearInterval(interval);
  }, [phoneNumber, router]);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setStep("verifying");

    try {
      const res = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber,
          code: otp,
        }),
      });

      if (!res.success) {
        setError(res.error ?? "OTP verification failed");
        setStep("waiting-otp");
        setOtp("");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Connection failed");
      setStep("waiting-otp");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError("");
    setLoading(true);
    setWaitTimer(60);

    try {
      const res = await apiFetch("/api/auth/resend-otp", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      });

      if (!res.success) {
        setError(res.error ?? "Gagal mengirim ulang OTP");
        setWaitTimer(0);
      }
    } catch {
      setError("Connection failed");
      setWaitTimer(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (waitTimer <= 0) return;
    const timer = setTimeout(() => setWaitTimer(waitTimer - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitTimer]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md px-4"
      >
        <div className="rounded-2xl border border-border/60 bg-surface/70 px-8 py-10 shadow-xl backdrop-blur-2xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent shadow-lg shadow-accent/20">
              <MessageCircle className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gradient">Verifikasi WhatsApp</h1>
            <p className="mt-2 text-sm text-muted-foreground/80">{phoneNumber}</p>
          </div>

          {step === "waiting-save" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  📱 Cek WhatsApp Anda dan balas pesan dari Storage ByAFR dengan mengetik:
                </p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-2">SAVE</p>
              </div>
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Menunggu konfirmasi Anda...
              </p>
            </motion.div>
          )}

          {(step === "waiting-otp" || step === "verifying") && (
            <motion.form
              onSubmit={handleVerifyOTP}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4">
                <div className="flex items-center gap-2 text-green-900 dark:text-green-100">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-medium">Konfirmasi diterima! ✓</p>
                </div>
                <p className="text-sm text-green-700 dark:text-green-200 mt-2">
                  Masukkan kode OTP yang telah dikirim ke WhatsApp Anda
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Kode OTP</label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="h-11 text-center text-2xl tracking-widest font-mono"
                  disabled={step === "verifying"}
                  autoFocus
                />
                <p className="mt-1 text-xs text-muted-foreground">Kode berlaku 5 menit</p>
              </div>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
              )}

              <Button
                type="submit"
                className="h-11 w-full"
                disabled={loading || otp.length !== 6 || step === "verifying"}
              >
                {step === "verifying" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  "Verifikasi"
                )}
              </Button>

              <div className="text-center">
                <p className="text-xs text-muted-foreground">Tidak menerima kode?</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResendOTP}
                  disabled={waitTimer > 0 || loading}
                  className="text-accent hover:text-accent/80"
                >
                  {waitTimer > 0 ? `Tunggu ${waitTimer}s` : "Kirim Ulang"}
                </Button>
              </div>
            </motion.form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyWAPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <VerifyWAContent />
    </Suspense>
  );
}
