"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes, formatDate, cn } from "@/lib/utils";
import { useState, use } from "react";
import {
  ArrowLeft, User, FileText, FolderOpen, Activity, Shield,
  Clock, HardDrive, Star, Trash2, Edit, Save, X, KeyRound,
  Upload, Download, LogIn, MoreHorizontal, Loader2, Check, Eye, EyeOff, AlertCircle,
} from "lucide-react";

interface UserDetail {
  user: {
    id: string;
    username: string;
    email: string | null;
    role: string;
    status: string;
    quotaBytes: number;
    usedBytes: number;
    mustChangePassword?: boolean;
    bandwidthQuotaBytes?: number;
    createdAt: string;
    updatedAt: string;
  };
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    isFavorite: boolean;
    isNote: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
  activity: Array<{
    id: string;
    action: string;
    createdAt: string;
    metadata: unknown;
  }>;
  sessions: Array<{
    id: string;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
    expiresAt: string;
  }>;
  storageByType: Array<{
    mimeType: string;
    count: number;
    totalSize: number;
  }>;
}

const actionIcons: Record<string, typeof Upload> = {
  upload: Upload,
  download: Download,
  delete: Trash2,
  login: Shield,
  create: FileText,
  restore: Upload,
};

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    quotaGB: 10,
    bandwidthGB: 0,
    mustChangePassword: false,
  });
  const [saving, setSaving] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: async () => {
      const res = await apiFetch<UserDetail>(`/api/admin/users/${id}`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 skeleton rounded-lg" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { user, files, folders, activity, sessions, storageByType } = data;
  const storagePct = user.quotaBytes > 0 ? (user.usedBytes / user.quotaBytes) * 100 : 0;

  async function saveUser() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        username: form.username || undefined,
        email: form.email || undefined,
        quotaBytes: form.quotaGB * 1073741824,
        bandwidthQuotaBytes: form.bandwidthGB * 1073741824,
        mustChangePassword: form.mustChangePassword,
      };
      if (form.password) body.password = form.password;
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.success) {
        setEditing(false);
        queryClient.invalidateQueries({ queryKey: ["admin-user-detail"] });
      } else {
        setPwMsg({ type: "error", text: res.error ?? "Failed to update user" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    if (pwNew.length < 8) {
      setPwMsg({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ type: "error", text: "Passwords do not match" });
      return;
    }
    setPwSaving(true);
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: pwNew }),
      });
      if (res.success) {
        setPwMsg({ type: "success", text: "Password changed successfully" });
        setPwNew("");
        setPwConfirm("");
        queryClient.invalidateQueries({ queryKey: ["admin-user-detail"] });
      } else {
        setPwMsg({ type: "error", text: res.error ?? "Failed to change password" });
      }
    } catch {
      setPwMsg({ type: "error", text: "Connection failed" });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back button + Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{user.username}</h1>
          <p className="mt-1 text-sm text-muted-foreground/70">{user.email ?? "No email"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              user.status === "active"
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-red-500/10 text-red-600"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", user.status === "active" ? "bg-emerald-500" : "bg-red-500")} />
            {user.status}
          </span>
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent uppercase">
            {user.role}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg text-muted-foreground/60 hover:text-accent hover:bg-accent/10"
            title={editing ? "Cancel edit" : "Edit User"}
            onClick={() => {
              if (editing) {
                setEditing(false);
              } else {
                setForm({
                  username: user.username,
                  email: user.email ?? "",
                  password: "",
                  quotaGB: Math.round(user.quotaBytes / 1073741824),
                  bandwidthGB: Math.round((user.bandwidthQuotaBytes ?? 0) / 1073741824),
                  mustChangePassword: user.mustChangePassword ?? false,
                });
                setEditing(true);
              }
            }}
          >
            {editing ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
          </Button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
                <HardDrive className="h-6 w-6 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatBytes(user.usedBytes)}</p>
                <p className="text-sm text-muted-foreground">of {formatBytes(user.quotaBytes)} used</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                <FileText className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{files.length}</p>
                <p className="text-sm text-muted-foreground">files, {folders.length} folders</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                <Activity className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activity.length}</p>
                <p className="text-sm text-muted-foreground">activity logs</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Storage Progress */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex justify-between text-sm">
              <span className="font-semibold">{formatBytes(user.usedBytes)}</span>
              <span className="text-muted-foreground">{formatBytes(user.quotaBytes)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted/50">
              <motion.div
                className="h-full rounded-full bg-accent-gradient"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(storagePct, 100)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>

            {/* Storage by type */}
            {storageByType.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  By File Type
                </p>
                {storageByType.map((item, idx) => (
                  <div key={item.mimeType} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.mimeType}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground/60">{item.count} files</span>
                      <span className="font-mono text-xs">{formatBytes(item.totalSize)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Files & Folders */}
      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Files ({files.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 space-y-1 overflow-auto">
                {files.slice(0, 20).map((file) => (
                  <div key={file.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-accent" />
                      <span className="truncate text-sm">{file.name}</span>
                      {file.isFavorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </div>
                ))}
                {files.length > 20 && (
                  <p className="text-center text-xs text-muted-foreground/60 py-2">
                    + {files.length - 20} more files
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="h-full border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 space-y-1 overflow-auto">
                {activity.slice(0, 15).map((log) => {
                  const Icon = actionIcons[log.action] ?? Activity;
                  return (
                    <div key={log.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <Icon className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm capitalize">{log.action.replace(/_/g, " ")}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground/60">
                        {formatDate(log.createdAt, "short")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Sessions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Active Sessions ({sessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between rounded-xl border border-border/40 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                      <LogIn className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-mono text-muted-foreground">{session.ip ?? "Unknown IP"}</p>
                      <p className="text-xs text-muted-foreground/60 truncate max-w-xs">
                        {session.userAgent?.slice(0, 60) ?? "Unknown"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{formatDate(session.createdAt, "short")}</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      Expires {formatDate(session.expiresAt, "short")}
                    </p>
                  </div>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No active sessions</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Edit User */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Edit className="h-4 w-4 text-muted-foreground" />
                Edit User: {user.username}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground/80">Username</label>
                    <Input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="Username"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground/80">Email</label>
                    <Input
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="Email (optional)"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground/80">New Password (leave blank to keep current)</label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="New password"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground/80">Quota (GB)</label>
                    <Input
                      type="number"
                      value={form.quotaGB}
                      onChange={(e) => setForm({ ...form, quotaGB: parseInt(e.target.value) || 10 })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground/80">Bandwidth (GB, 0 = unlimited)</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.bandwidthGB}
                      onChange={(e) => setForm({ ...form, bandwidthGB: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.mustChangePassword}
                    onChange={(e) => setForm({ ...form, mustChangePassword: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  Force password reset on next login
                </label>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveUser} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Change Password */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Input
                  type={showPwNew ? "text" : "password"}
                  placeholder="New password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwNew(!showPwNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                >
                  {showPwNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <Input
                  type={showPwConfirm ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwConfirm(!showPwConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                >
                  {showPwConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwNew && (
                <div className="flex gap-2 text-xs">
                  <div className={cn("flex items-center gap-1", pwNew.length >= 8 ? "text-emerald-400" : "text-muted-foreground/50")}>
                    <Check className="h-3 w-3" /> 8+ chars
                  </div>
                </div>
              )}
              {pwMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm flex items-center gap-2",
                    pwMsg.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-danger/10 text-danger"
                  )}
                >
                  {pwMsg.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {pwMsg.text}
                </motion.div>
              )}
              <Button
                onClick={changePassword}
                disabled={pwSaving || !pwNew || !pwConfirm}
                className="w-full"
              >
                {pwSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}