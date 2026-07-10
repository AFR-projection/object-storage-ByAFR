"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import {
  UserPlus,
  Ban,
  Trash2,
  LogIn,
  Loader2,
  AlertCircle,
  CheckCircle,
  Search,
  Shield,
  User,
  MoreHorizontal,
  Eye,
  Edit,
  Save,
  X,
} from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  status: string;
  quotaBytes: number;
  usedBytes: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ username: "", email: "", password: "", quotaGB: 10 });
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({ username: "", email: "", password: "", quotaGB: 10 });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await apiFetch<{ users: AdminUser[] }>("/api/admin/users");
      return res.data?.users ?? [];
    },
  });

  const filtered = (users ?? []).filter(
    (u) =>
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  async function createUser() {
    setFormError("");
    setFormLoading(true);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: form.username,
          email: form.email || undefined,
          password: form.password,
          quotaBytes: form.quotaGB * 1073741824,
        }),
      });
      if (!res.success) {
        setFormError(res.error ?? "Failed to create user");
        return;
      }
      setShowCreate(false);
      setForm({ username: "", email: "", password: "", quotaGB: 10 });
      showSuccess("User created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      setFormError("Connection failed");
    } finally {
      setFormLoading(false);
    }
  }

  async function suspendUser(id: string, status: "active" | "suspended") {
    setActionLoading(id);
    setActionError("");
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      if (!res.success) {
        setActionError(res.error ?? "Failed to update status");
        return;
      }
      showSuccess(`User ${status === "suspended" ? "suspended" : "activated"}`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      setActionError("Connection failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(id: string) {
    if (!confirm("Delete this user and all their data?")) return;
    setActionLoading(id);
    setActionError("");
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "DELETE",
        body: JSON.stringify({ id, deleteData: true }),
      });
      if (!res.success) {
        setActionError(res.error ?? "Failed to delete user");
        return;
      }
      showSuccess("User deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      setActionError("Connection failed");
    } finally {
      setActionLoading(null);
    }
  }

  function startEdit(user: AdminUser) {
    setEditingUser(user);
    setEditForm({
      username: user.username,
      email: user.email ?? "",
      password: "",
      quotaGB: Math.round(user.quotaBytes / 1073741824),
    });
  }

  async function saveEditUser() {
    if (!editingUser) return;
    setActionLoading(editingUser.id);
    setActionError("");
    try {
      const body: Record<string, unknown> = {
        id: editingUser.id,
        username: editForm.username || undefined,
        email: editForm.email || undefined,
        quotaBytes: editForm.quotaGB * 1073741824,
      };
      if (editForm.password) body.password = editForm.password;
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.success) {
        setActionError(res.error ?? "Failed to update user");
        return;
      }
      showSuccess("User updated successfully");
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      setActionError("Connection failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function impersonate(id: string) {
    setActionLoading(id);
    try {
      const res = await apiFetch("/api/auth/impersonate", {
        method: "POST",
        body: JSON.stringify({ userId: id }),
      });
      if (!res.success) {
        setActionError(res.error ?? "Failed to impersonate");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setActionError("Connection failed");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setFormError(""); }} className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Messages */}
      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400"
        >
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMsg}
        </motion.div>
      )}

      {actionError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
        </motion.div>
      )}

      {/* Create User Form */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-accent" />
                Create New User
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  placeholder="Username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <Input
                  placeholder="Email (optional)"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Quota (GB)"
                  value={form.quotaGB}
                  onChange={(e) => setForm({ ...form, quotaGB: parseInt(e.target.value) || 10 })}
                />
              </div>
              {formError && (
                <p className="mt-3 text-sm text-red-500">{formError}</p>
              )}
              <Button onClick={createUser} disabled={formLoading} className="mt-4">
                {formLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Shield className="h-4 w-4 mr-1.5" />}
                Create User
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Users Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-surface overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[1fr_100px_80px_120px_120px] border-b border-border/40 bg-muted/30 px-4 py-3 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Storage</span>
            <span className="text-right">Actions</span>
          </div>

          {filtered.map((user, idx) => {
            const isBusy = actionLoading === user.id;
            return (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="md:grid md:grid-cols-[1fr_100px_80px_120px_120px] items-center gap-3 px-4 py-4 border-b border-border/30 last:border-0 hover:bg-accent/5 transition-colors"
              >
                {/* Mobile card layout */}
                <div className="md:hidden space-y-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                      <User className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{user.username}</p>
                      <p className="text-xs text-muted-foreground">{user.email ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-2 py-0.5 font-medium uppercase">{user.role}</span>
                    <StatusBadge status={user.status} />
                    <span>{formatBytes(user.usedBytes)} / {formatBytes(user.quotaBytes)}</span>
                    <span>{formatDate(user.createdAt, "short")}</span>
                  </div>
                </div>

                {/* Desktop columns */}
                <div className="hidden md:flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                    <User className="h-4 w-4 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{user.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email ?? "—"}</p>
                  </div>
                </div>

                <span className="hidden md:inline text-xs font-medium uppercase text-muted-foreground">{user.role}</span>

                <div className="hidden md:block">
                  <StatusBadge status={user.status} />
                </div>

                <span className="hidden md:inline font-mono text-xs text-muted-foreground">
                  {formatBytes(user.usedBytes)}
                </span>

                {/* Actions */}
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-info hover:bg-info/10"
                    title="View Details"
                    onClick={() => router.push(`/admin/users/${user.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-accent hover:bg-accent/10"
                    title="Edit User"
                    onClick={() => startEdit(user)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {user.role !== "master" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-accent hover:bg-accent/10"
                        title="Impersonate"
                        disabled={isBusy}
                        onClick={() => impersonate(user.id)}
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-warning hover:bg-warning/10"
                        title="Suspend/Activate"
                        disabled={isBusy}
                        onClick={() => suspendUser(user.id, user.status === "active" ? "suspended" : "active")}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-danger hover:bg-danger/10"
                        title="Delete"
                        disabled={isBusy}
                        onClick={() => deleteUser(user.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {searchTerm ? "No users match your search" : "No users found"}
            </div>
          )}
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-2xl border border-border/50 bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
              <h2 className="text-lg font-semibold">Edit User: {editingUser.username}</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingUser(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground/80">Username</label>
                <Input
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  placeholder="Username"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground/80">Email</label>
                <Input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="Email (optional)"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground/80">New Password (leave blank to keep current)</label>
                <Input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="New password"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground/80">Quota (GB)</label>
                <Input
                  type="number"
                  value={editForm.quotaGB}
                  onChange={(e) => setEditForm({ ...editForm, quotaGB: parseInt(e.target.value) || 10 })}
                />
              </div>
              {actionError && (
                <p className="text-sm text-red-500">{actionError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button onClick={saveEditUser} disabled={actionLoading === editingUser.id}>
                  {actionLoading === editingUser.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        active
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-red-500")} />
      {status}
    </span>
  );
}