"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Plus,
  Trash2,
  RotateCw,
  Loader2,
  QrCode,
  Phone,
  X,
  ShieldCheck,
  AlertTriangle,
  HardDrive,
  Wifi,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { WhatsappSender } from "@/lib/db/schema";

type Method = "qr" | "pairing";
type QrData = { qrCode: string | null; pairingCode: string | null; status: string };
type SenderRow = WhatsappSender & {
  liveStatus?: string;
  hasLiveSocket?: boolean;
};

function effectiveStatus(sender: SenderRow): string {
  if (sender.hasLiveSocket && sender.liveStatus && sender.liveStatus !== "offline") {
    return sender.liveStatus;
  }
  return sender.status;
}

export default function WhatsAppSettings() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [method, setMethod] = useState<Method>("qr");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [connectModal, setConnectModal] = useState<string | null>(null);
  const [qrData, setQrData] = useState<QrData | null>(null);
  const queryClient = useQueryClient();

  const { data: senders = [], isLoading } = useQuery({
    queryKey: ["whatsapp-senders"],
    queryFn: async () => {
      const res = await apiFetch<SenderRow[]>("/api/admin/whatsapp/senders");
      return res.data ?? [];
    },
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (!connectModal) {
      setQrData(null);
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const res = await apiFetch<QrData>(`/api/admin/whatsapp/qr?id=${connectModal}`);
        if (!active) return;
        if (res.data) setQrData(res.data);
        if (res.data?.status === "connected") {
          setConnectModal(null);
          queryClient.invalidateQueries({ queryKey: ["whatsapp-senders"] });
        }
      } catch (err) {
        console.error("connect poll error:", err);
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [connectModal, queryClient]);

  const addSender = useMutation({
    mutationFn: async (data: { phoneNumber: string; displayName: string; method: Method }) => {
      const res = await apiFetch<{ id: string }>("/api/admin/whatsapp/senders", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to add sender");
      return res.data?.id;
    },
    onSuccess: (senderId) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-senders"] });
      setShowAddModal(false);
      setPhoneNumber("");
      setDisplayName("");
      if (senderId) setConnectModal(senderId);
    },
  });

  const deleteSender = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch("/api/admin/whatsapp/senders", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-senders"] }),
  });

  const reconnectSender = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch("/api/admin/whatsapp/reconnect", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: (_, id) => {
      setConnectModal(id);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-senders"] });
    },
  });

  const statusColor = (s: string) =>
    s === "connected" ? "bg-green-500"
    : s === "connecting" ? "bg-yellow-500"
    : s === "error" ? "bg-red-500"
    : "bg-gray-400";

  const statusText = (s: string) =>
    s === "connected" ? "🟢 Connected"
    : s === "connecting" ? "🟡 Connecting..."
    : s === "error" ? "🔴 Error"
    : "⚫ Disconnected";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="WhatsApp Gateway"
        subtitle="Manage WhatsApp numbers for sending OTP & notifications"
        actions={
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Sender
          </Button>
        }
      />

      <WaHealthPanel />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : senders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No WhatsApp sender yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {senders.map((sender) => {
            const status = effectiveStatus(sender);
            return (
            <motion.div key={sender.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={cn("w-3 h-3 rounded-full", statusColor(status))} />
                        <h3 className="font-semibold text-lg">{sender.displayName}</h3>
                        <span className="text-sm px-2 py-1 bg-muted rounded">
                          {sender.phoneNumber}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{statusText(status)}</p>
                      {sender.liveStatus && sender.liveStatus !== sender.status && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Live socket: {sender.liveStatus}
                          {!sender.hasLiveSocket ? " (offline in process — reconnect if OTP fails)" : ""}
                        </p>
                      )}
                      {sender.errorMessage && (
                        <p className="text-xs text-red-600 mt-1 truncate max-w-md">
                          {sender.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {status !== "connected" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConnectModal(sender.id)}
                          className="gap-2"
                        >
                          <QrCode className="w-4 h-4" />
                          Connect
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => reconnectSender.mutate(sender.id)}
                        disabled={reconnectSender.isPending}
                        title="Reconnect"
                      >
                        {reconnectSender.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCw className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => deleteSender.mutate(sender.id)}
                        disabled={deleteSender.isPending}
                        title="Delete"
                      >
                        {deleteSender.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            );
          })}
        </div>
      )}

      {/* Add Sender Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-background rounded-lg p-6 w-full max-w-md border"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Add WhatsApp Sender</h2>
                <button onClick={() => setShowAddModal(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Method switch */}
              <div className="grid grid-cols-2 gap-2 mb-5 p-1 bg-muted rounded-lg">
                <button
                  onClick={() => setMethod("qr")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors",
                    method === "qr" ? "bg-background shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <QrCode className="w-4 h-4" />
                  Scan QR
                </button>
                <button
                  onClick={() => setMethod("pairing")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors",
                    method === "pairing" ? "bg-background shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <Phone className="w-4 h-4" />
                  Phone Number Code
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Display Name</label>
                  <Input
                    placeholder="e.g. Main Sender"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">WhatsApp Number</label>
                  <Input
                    placeholder="628123456789"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Format: 628XXXXXXXXX (with country code, without +)
                  </p>
                </div>
                <p className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 p-3 rounded">
                  {method === "qr" ? (
                    <>
                      <b>QR Mode:</b> After clicking, a QR Code appears. Open WhatsApp →
                      Linked Devices → Link a Device → scan the QR.
                    </>
                  ) : (
                    <>
                      <b>Code Mode:</b> After clicking, an 8-digit code appears. Open WhatsApp →
                      Linked Devices → Link with phone number → enter the code.
                    </>
                  )}
                </p>
              </div>

              {addSender.isError && (
                <p className="text-sm text-red-500 mb-4">
                  {(addSender.error as Error)?.message}
                </p>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={() => addSender.mutate({ phoneNumber, displayName, method })}
                  disabled={!displayName || !phoneNumber || addSender.isPending}
                  className="flex-1 gap-2"
                >
                  {addSender.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : method === "qr" ? (
                    <QrCode className="w-4 h-4" />
                  ) : (
                    <Phone className="w-4 h-4" />
                  )}
                  {method === "qr" ? "Show QR" : "Show Code"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connect (QR / Pairing) Modal */}
      <AnimatePresence>
        {connectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-background rounded-lg p-6 w-full max-w-md border"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Connect WhatsApp</h2>
                <button onClick={() => setConnectModal(null)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {qrData?.qrCode ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <img src={qrData.qrCode} alt="QR Code" className="w-64 h-64" />
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    Open WhatsApp → Linked Devices → Link a Device, then scan this QR.
                    <br />QR refreshes automatically.
                  </p>
                </div>
              ) : qrData?.pairingCode ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-500 rounded-lg px-8 py-6 text-center">
                    <p className="text-xs text-muted-foreground mb-2">Pairing Code</p>
                    <p className="text-4xl font-mono font-bold text-blue-600 dark:text-blue-400 tracking-[0.3em]">
                      {qrData.pairingCode}
                    </p>
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    Open WhatsApp → Linked Devices → Link with phone number →
                    enter the code above.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="text-sm text-muted-foreground">Preparing connection...</p>
                </div>
              )}

              <div className="w-full pt-6 mt-2 border-t">
                <Button onClick={() => setConnectModal(null)} className="w-full" variant="outline">
                  Tutup
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── WhatsApp health / diagnostics panel ──────────────────────────────────────

type WaHealth = {
  healthy: boolean;
  sessionsDir: string;
  sessionsDirWritable: boolean;
  waVersionSource: "env" | "live" | "fallback";
  liveInstances: number;
  connected: number;
  problems: string[];
};

function WaHealthPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-health"],
    queryFn: async () => {
      const res = await apiFetch<WaHealth>("/api/admin/whatsapp/health");
      if (!res.success || !res.data) throw new Error(res.error ?? "unavailable");
      return res.data;
    },
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking WhatsApp health…
        </CardContent>
      </Card>
    );
  }

  const ok = data.healthy;

  return (
    <Card
      className={cn(
        "border",
        ok ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-amber-500/30 bg-amber-500/[0.05]"
      )}
    >
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              ok
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            )}
          >
            {ok ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {ok ? "WhatsApp gateway healthy" : "WhatsApp gateway needs attention"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.connected} connected · {data.liveInstances} live socket
              {data.liveInstances === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <HealthStat
            icon={HardDrive}
            label="Sessions writable"
            value={data.sessionsDirWritable ? "Yes" : "No"}
            good={data.sessionsDirWritable}
          />
          <HealthStat
            icon={Wifi}
            label="WA version source"
            value={data.waVersionSource}
            good={data.waVersionSource !== "fallback"}
          />
          <HealthStat
            icon={MessageCircle}
            label="Connected senders"
            value={String(data.connected)}
            good={data.connected > 0}
          />
        </div>

        {data.problems.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
            {data.problems.map((p, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-amber-800 dark:text-amber-100/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {p}
              </li>
            ))}
          </ul>
        )}

        <p className="truncate font-mono text-[10.5px] text-muted-foreground/70">
          {data.sessionsDir}
        </p>
      </CardContent>
    </Card>
  );
}

function HealthStat({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <Icon className={cn("h-4 w-4 shrink-0", good ? "text-emerald-500" : "text-amber-500")} />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <p className={cn("truncate text-xs font-semibold capitalize", good ? "" : "text-amber-600 dark:text-amber-400")}>
          {value}
        </p>
      </div>
    </div>
  );
}
