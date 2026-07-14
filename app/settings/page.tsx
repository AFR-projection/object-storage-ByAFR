"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { KeyRound, User, Monitor, Shield, Loader2, Check, Eye, EyeOff, LogOut, Laptop, Trash2, RefreshCw, Copy, Key, Webhook, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/theme-provider";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  validatePasswordStrength,
  getPasswordStrengthLabel,
  getPasswordStrengthColor,
  getPasswordPolicyRules,
} from "@/lib/security/password-policy";
import { useQueryClient } from "@tanstack/react-query";
interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  quotaBytes: number;
  usedBytes: number;
  totpEnabled?: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await apiFetch<SessionUser>("/api/auth/login");
      if (!res.success || !res.data) throw new Error(res.error ?? "Not authenticated");
      return res.data;
    },
  });

  const user = sessionData;

  if (sessionLoading) return <SettingsSkeleton />;
  if (!user) return null;

  return <SettingsContent user={user} />;
}

function SettingsContent({ user }: { user: SessionUser }) {
  const [openSection, setOpenSection] = useState<string | null>("password");

  const sections = [
    {
      id: "password",
      title: "Password",
      description: "Change your account password",
      icon: KeyRound,
      gradient: "from-amber-500 to-orange-500",
      component: <PasswordSection />,
    },
    {
      id: "2fa",
      title: "Two-factor authentication",
      description: "Authenticator app (TOTP) + recovery codes",
      icon: Shield,
      gradient: "from-rose-500 to-pink-500",
      component: <TwoFactorSection enabled={!!user.totpEnabled} />,
    },
    {
      id: "profile",
      title: "Profile",
      description: "Your account information",
      icon: User,
      gradient: "from-blue-500 to-cyan-500",
      component: <ProfileSection user={user} />,
    },
    {
      id: "api-keys",
      title: "API Keys",
      description: "Programmatic access with scoped keys",
      icon: Key,
      gradient: "from-sky-500 to-blue-600",
      component: <ApiKeysSection />,
    },
    {
      id: "webhooks",
      title: "Webhooks",
      description: "HTTP callbacks for upload, delete, share",
      icon: Webhook,
      gradient: "from-rose-500 to-orange-500",
      component: <WebhooksSection />,
    },
    {
      id: "appearance",
      title: "Appearance",
      description: "Theme preferences",
      icon: Monitor,
      gradient: "from-purple-500 to-violet-500",
      component: <AppearanceSection />,
    },
    {
      id: "sessions",
      title: "Sessions",
      description: "Manage your active sessions",
      icon: Laptop,
      gradient: "from-emerald-500 to-teal-500",
      component: <SessionsSection />,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => {
          const isOpen = openSection === section.id;
          const Icon = section.icon;
          return (
            <Card
              key={section.id}
              className={cn(
                "overflow-hidden transition-all duration-200",
                isOpen && "shadow-lg"
              )}
            >
              <button
                onClick={() => setOpenSection(isOpen ? null : section.id)}
                className="flex w-full items-center gap-3 p-4 text-left sm:p-5"
                aria-expanded={isOpen}
              >
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm",
                  section.gradient
                )}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{section.title}</p>
                  <p className="text-xs text-muted-foreground/70">{section.description}</p>
                </div>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-muted-foreground/50"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>
              </button>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="border-t border-border/50 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                    {section.component}
                  </div>
                </motion.div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Password Section ─────────────────────────────────────────────────────────

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();
  const strength = newPassword ? validatePasswordStrength(newPassword) : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ message: string; staySignedIn?: boolean }>("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to change password");
      return res.data!;
    },
    onSuccess: (data) => {
      setMessage({ type: "success", text: data.message });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (!data.staySignedIn) {
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      }
    },
    onError: (err: Error) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (strength && !strength.valid) {
      setMessage({ type: "error", text: strength.errors.join(", ") });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ul className="space-y-1 rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
        {getPasswordPolicyRules().map((rule) => (
          <li key={rule}>• {rule}</li>
        ))}
      </ul>
      <div className="space-y-3">
        <div className="relative">
          <Input
            type={showCurrent ? "text" : "password"}
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            aria-label={showCurrent ? "Hide current password" : "Show current password"}
          >
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="relative">
          <Input
            type={showNew ? "text" : "password"}
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="pr-10"
            required
            minLength={10}
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            aria-label={showNew ? "Hide new password" : "Show new password"}
          >
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="relative">
          <Input
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="pr-10"
            required
            minLength={10}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {strength && (
        <p className={cn("text-xs font-medium", getPasswordStrengthColor(strength.score))}>
          Strength: {getPasswordStrengthLabel(strength.score)}
        </p>
      )}

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-lg px-4 py-2 text-sm",
            message.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-danger/10 text-danger"
          )}
        >
          {message.type === "success" && <Check className="mb-0.5 mr-1.5 inline h-3.5 w-3.5" />}
          {message.text}
        </motion.div>
      )}

      <Button
        type="submit"
        disabled={mutation.isPending || !currentPassword || !newPassword || !confirmPassword}
        className="w-full"
      >
        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Change Password
      </Button>
    </form>
  );
}

function TwoFactorSection({ enabled: initiallyEnabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ secret: string; otpauthUrl: string }>("/api/auth/2fa", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.success || !res.data) {
        setError(res.error ?? "Failed to start setup");
        return;
      }
      setSetup(res.data);
      setRecoveryCodes(null);
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ recoveryCodes: string[] }>("/api/auth/2fa", {
        method: "PUT",
        body: JSON.stringify({ code }),
      });
      if (!res.success || !res.data) {
        setError(res.error ?? "Invalid code");
        return;
      }
      setRecoveryCodes(res.data.recoveryCodes);
      setEnabled(true);
      setSetup(null);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["session"] });
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/2fa", {
        method: "DELETE",
        body: JSON.stringify({ password, code: code || undefined }),
      });
      if (!res.success) {
        setError(res.error ?? "Failed to disable");
        return;
      }
      setEnabled(false);
      setPassword("");
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["session"] });
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Status:{" "}
        <span className={enabled ? "text-emerald-500 font-medium" : "font-medium"}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </p>

      {recoveryCodes && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Save these recovery codes now — they won&apos;t be shown again.
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {!enabled && !setup && (
        <Button onClick={startSetup} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Set up authenticator
        </Button>
      )}

      {setup && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Add this account in Google Authenticator / Authy using the secret below, then enter a code.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 font-mono text-sm break-all">
            {setup.secret}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => navigator.clipboard.writeText(setup.secret)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <a
            href={setup.otpauthUrl}
            className="block text-xs text-accent hover:underline break-all"
          >
            Open otpauth link
          </a>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="font-mono tracking-widest"
          />
          <Button onClick={confirmSetup} disabled={loading || code.length < 6}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm & enable
          </Button>
        </div>
      )}

      {enabled && (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <p className="text-sm font-medium">Disable 2FA</p>
          <Input
            type="password"
            placeholder="Account password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            placeholder="Current authenticator code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
          />
          <Button variant="destructive" onClick={disable} disabled={loading || !password}>
            Disable 2FA
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

// ─── API Keys Section ─────────────────────────────────────────────────────────

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | Date | null;
  expiresAt: string | Date | null;
  createdAt: string | Date;
};

function ApiKeysSection() {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await apiFetch<{ keys: ApiKeyRow[] }>("/api/settings/api-keys");
      if (!res.success) throw new Error(res.error ?? "Failed to load");
      return res.data!.keys;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ key: ApiKeyRow & { rawKey: string } }>("/api/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, scopes }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to create");
      return res.data!.key;
    },
    onSuccess: (key) => {
      setCreatedRaw(key.rawKey);
      setName("");
      setError(null);
      refetch();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch("/api/settings/api-keys", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to delete");
    },
    onSuccess: () => refetch(),
  });

  function toggleScope(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || scopes.length === 0) return;
          createMutation.mutate();
        }}
      >
        <Input
          placeholder="Key name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="flex flex-wrap gap-2">
          {(["read", "upload", "delete"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleScope(s)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize",
                scopes.includes(s) ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={createMutation.isPending || !name.trim() || scopes.length === 0} className="w-full">
          {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Create API Key
        </Button>
      </form>

      {createdRaw && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-amber-500">Copy now — shown once</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-xs">{createdRaw}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => navigator.clipboard.writeText(createdRaw)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="space-y-2">
          {(data ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">No API keys yet.</li>
          )}
          {(data ?? []).map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover/50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  {k.keyPrefix}… · {k.scopes.join(", ")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-danger"
                onClick={() => {
                  if (confirm("Revoke this API key?")) deleteMutation.mutate(k.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Webhooks Section ─────────────────────────────────────────────────────────

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastDeliveryAt: string | Date | null;
  lastStatus: number | null;
  createdAt: string | Date;
};

function WebhooksSection() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["upload", "delete", "share"]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const res = await apiFetch<{ webhooks: WebhookRow[] }>("/api/settings/webhooks");
      if (!res.success) throw new Error(res.error ?? "Failed to load");
      return res.data!.webhooks;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ webhook: WebhookRow & { secret: string } }>("/api/settings/webhooks", {
        method: "POST",
        body: JSON.stringify({ url, events }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to create");
      return res.data!.webhook;
    },
    onSuccess: (hook) => {
      setCreatedSecret(hook.secret);
      setUrl("");
      setError(null);
      refetch();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch("/api/settings/webhooks", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to delete");
    },
    onSuccess: () => refetch(),
  });

  function toggleEvent(ev: string) {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim() || events.length === 0) return;
          createMutation.mutate();
        }}
      >
        <Input
          type="url"
          placeholder="https://example.com/webhook"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <div className="flex flex-wrap gap-2">
          {(["upload", "delete", "share"] as const).map((ev) => (
            <button
              key={ev}
              type="button"
              onClick={() => toggleEvent(ev)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize",
                events.includes(ev) ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"
              )}
            >
              {ev}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={createMutation.isPending || !url.trim() || events.length === 0} className="w-full">
          {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add Webhook
        </Button>
      </form>

      {createdSecret && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-amber-500">Signing secret — copy now</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-xs">{createdSecret}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => navigator.clipboard.writeText(createdSecret)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="space-y-2">
          {(data ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">No webhooks yet.</li>
          )}
          {(data ?? []).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover/50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{h.url}</p>
                <p className="text-xs text-muted-foreground">
                  {h.events.join(", ")} · {h.enabled ? "enabled" : "disabled"}
                  {h.lastStatus != null ? ` · last ${h.lastStatus}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-danger"
                onClick={() => {
                  if (confirm("Delete this webhook?")) deleteMutation.mutate(h.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Profile Section ──────────────────────────────────────────────────────────

function ProfileSection({ user }: { user: SessionUser }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-surface-hover/50 p-4">
        <label className="text-xs font-medium text-muted-foreground/70">Username</label>
        <p className="mt-0.5 text-sm font-medium">{user.username}</p>
      </div>
      <div className="rounded-lg bg-surface-hover/50 p-4">
        <label className="text-xs font-medium text-muted-foreground/70">Email</label>
        <p className="mt-0.5 text-sm font-medium">{user.email ?? "No email set"}</p>
      </div>
      <div className="rounded-lg bg-surface-hover/50 p-4">
        <label className="text-xs font-medium text-muted-foreground/70">Role</label>
        <p className="mt-0.5 text-sm font-medium capitalize">{user.role}</p>
      </div>
    </div>
  );
}

// ─── Appearance Section ───────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Theme</label>
      <div className="grid grid-cols-3 gap-2">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
              theme === value
                ? "border-accent bg-accent/10"
                : "border-border/50 hover:border-border/80 bg-transparent"
            )}
          >
            <Icon className={cn("h-5 w-5", theme === value ? "text-accent" : "text-muted-foreground")} />
            <span className={cn("text-xs font-medium", theme === value ? "text-accent" : "text-muted-foreground")}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

// ─── Sessions Section ─────────────────────────────────────────────────────────

type DeviceSession = {
  id: string;
  idShort?: string;
  ip: string | null;
  userAgent: string | null;
  deviceLabel: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

function SessionsSection() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const router = useRouter();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: async () => {
      const res = await apiFetch<{ sessions: DeviceSession[] }>("/api/auth/sessions");
      if (!res.success) throw new Error(res.error ?? "Failed to load sessions");
      return res.data!.sessions;
    },
  });

  async function handleRevoke(id: string, wasCurrent: boolean) {
    setRevokingId(id);
    try {
      const res = await apiFetch<{ wasCurrent?: boolean }>(`/api/auth/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.success) return;
      if (wasCurrent || res.data?.wasCurrent) {
        router.push("/login");
        router.refresh();
        return;
      }
      await refetch();
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/sessions", { method: "DELETE" });
      await refetch();
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleLogoutAll() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/sessions?all=1", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground/80">
          Devices currently signed in to your account.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((session) => (
            <div
              key={session.id}
              className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/10 p-3"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Laptop className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{session.deviceLabel}</p>
                  {session.isCurrent && (
                    <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      This device
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  IP: {session.ip ?? "unknown"} · Session {session.idShort ?? session.id.slice(0, 8)} · Last
                  active {new Date(session.lastActiveAt).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Signed in {new Date(session.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                disabled={revokingId === session.id}
                onClick={() => handleRevoke(session.id, session.isCurrent)}
                title="Revoke session"
              >
                {revokingId === session.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
          {(data ?? []).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No active sessions</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          onClick={handleRevokeOthers}
          disabled={loggingOut}
          className="flex-1"
        >
          Sign out other devices
        </Button>
        <Button
          variant="destructive"
          onClick={handleLogoutAll}
          disabled={loggingOut}
          className="flex-1"
        >
          {loggingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          Log out all sessions
        </Button>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-surface-hover" />
      <div className="h-4 w-64 animate-pulse rounded-lg bg-surface-hover" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-hover" />
        ))}
      </div>
    </div>
  );
}