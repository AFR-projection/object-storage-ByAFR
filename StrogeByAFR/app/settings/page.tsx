"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { KeyRound, User, Monitor, Shield, Loader2, Check, Eye, EyeOff, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/theme-provider";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  quotaBytes: number;
  usedBytes: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await apiFetch<{ user: SessionUser }>("/api/auth/login");
      if (!res.success) throw new Error(res.error ?? "Not authenticated");
      return res.data!.user;
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
      id: "profile",
      title: "Profile",
      description: "Your account information",
      icon: User,
      gradient: "from-blue-500 to-cyan-500",
      component: <ProfileSection user={user} />,
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
      icon: Shield,
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

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ message: string }>("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to change password");
      return res.data!.message;
    },
    onSuccess: (msg) => {
      setMessage({ type: "success", text: msg });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    },
    onError: (err: Error) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "New password must be at least 8 characters" });
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
            minLength={8}
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
            minLength={8}
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

      {newPassword && (
        <div className="flex gap-2 text-xs">
          <div className={cn("flex items-center gap-1", newPassword.length >= 8 ? "text-emerald-400" : "text-muted-foreground/50")}>
            <Check className="h-3 w-3" /> 8+ chars
          </div>
        </div>
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

function SessionsSection() {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  async function handleLogoutAll() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/login", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground/80">
        Sign out of all devices and sessions. You will need to log in again.
      </p>
      <Button
        variant="destructive"
        onClick={handleLogoutAll}
        disabled={loggingOut}
        className="w-full"
      >
        {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
        Log Out All Sessions
      </Button>
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