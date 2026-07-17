"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { notify } from "@/lib/system/notify-store";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import {
  Share2,
  Search,
  Trash2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Filter,
  CheckCircle,
  XCircle,
  Copy,
  Check,
} from "lucide-react";

type ShareRow = {
  id: string;
  token: string;
  shareUrl: string;
  permission: string;
  expiresAt: string | null;
  accessCount: number;
  maxAccessCount: number | null;
  lastAccessedAt: string | null;
  createdAt: string;
  fileId: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  ownerId: string;
  ownerUsername: string;
  status: "active" | "expired";
};

export default function AdminSharesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState<"all" | "active" | "expired">("all");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: shares, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-shares", status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      const res = await apiFetch<{ shares: ShareRow[] }>(`/api/admin/shares?${params}`);
      return res.data?.shares ?? [];
    },
  });

  const filtered = (shares ?? []).filter((s) => {
    if (!ownerSearch.trim()) return true;
    const q = ownerSearch.toLowerCase();
    return (
      s.ownerUsername.toLowerCase().includes(q) ||
      s.fileName.toLowerCase().includes(q) ||
      s.token.toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  }

  function revokeSelected() {
    if (selected.size === 0) return;
    confirm.open(
      {
        title: `Revoke ${selected.size} share link${selected.size !== 1 ? "s" : ""}?`,
        message: "Anyone holding these links will immediately lose access. This cannot be undone.",
        confirmLabel: "Revoke links",
        danger: true,
      },
      async () => {
        setRevoking(true);
        try {
          const res = await apiFetch("/api/admin/shares", {
            method: "DELETE",
            body: JSON.stringify({ ids: Array.from(selected) }),
          });
          if (!res.success) {
            notify({ title: res.error ?? "Failed to revoke shares", tone: "error" });
            return;
          }
          notify({ title: `${selected.size} share link(s) revoked`, tone: "success" });
          setSelected(new Set());
          queryClient.invalidateQueries({ queryKey: ["admin-shares"] });
        } catch {
          notify({ title: "Connection failed", tone: "error" });
        } finally {
          setRevoking(false);
        }
      }
    );
  }

  async function copyUrl(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Shares Center"
        subtitle="Review and revoke share links across all users"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.size === 0 || revoking}
              onClick={revokeSelected}
            >
              {revoking ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Revoke ({selected.size})
            </Button>
          </>
        }
      />

      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search owner, file, or token…"
              value={ownerSearch}
              onChange={(e) => setOwnerSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-xl bg-muted/40 p-1 border border-border/40">
            {(["all", "active", "expired"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm capitalize transition-colors",
                  status === s ? "bg-surface shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/40 overflow-hidden">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            {filtered.length} share{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No shares found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-muted-foreground">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">File</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Access</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium truncate max-w-[200px]">{s.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(s.fileSize)} · {s.permission}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${s.ownerId}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {s.ownerUsername}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {s.status === "active" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500 text-xs font-medium">
                            <CheckCircle className="h-3.5 w-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                            <XCircle className="h-3.5 w-3.5" /> Expired
                          </span>
                        )}
                        {s.expiresAt && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Exp {formatDate(s.expiresAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.accessCount}
                        {s.maxAccessCount != null ? ` / ${s.maxAccessCount}` : ""}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(s.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => copyUrl(s.shareUrl, s.id)}
                          >
                            {copied === s.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <a
                            href={s.shareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirm.element}
    </div>
  );
}
