"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Plus,
  Trash2,
  RotateCw,
  Loader2,
  Circle,
  Smartphone,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import type { WhatsappSender } from "@/lib/db/schema";

export default function WhatsAppSettings() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const queryClient = useQueryClient();

  const { data: senders = [], isLoading } = useQuery({
    queryKey: ["whatsapp-senders"],
    queryFn: async () => {
      const res = await apiFetch<WhatsappSender[]>("/api/admin/whatsapp/senders");
      return res.data ?? [];
    },
  });

  const addSender = useMutation({
    mutationFn: async (data: { phoneNumber: string; displayName: string }) => {
      const res = await apiFetch("/api/admin/whatsapp/senders", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-senders"] });
      setPhoneNumber("");
      setDisplayName("");
      setShowAddModal(false);
    },
  });

  const deleteSender = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch("/api/admin/whatsapp/senders", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-senders"] });
    },
  });

  const reconnectSender = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch("/api/admin/whatsapp/reconnect", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-senders"] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "text-green-500";
      case "connecting":
        return "text-yellow-500";
      case "disconnected":
        return "text-gray-500";
      case "error":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-green-50 dark:bg-green-950";
      case "connecting":
        return "bg-yellow-50 dark:bg-yellow-950";
      case "disconnected":
        return "bg-gray-50 dark:bg-gray-900";
      case "error":
        return "bg-red-50 dark:bg-red-950";
      default:
        return "bg-gray-50 dark:bg-gray-900";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">WhatsApp Gateway</h1>
          <p className="text-gray-500 mt-1">Kelola nomor WhatsApp untuk pengiriman OTP & notifikasi</p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="gap-2"
          size="lg"
        >
          <Plus className="w-4 h-4" />
          Tambah Sender
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4">
          {senders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageCircle className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada WhatsApp sender</p>
              </CardContent>
            </Card>
          ) : (
            senders.map((sender) => (
              <motion.div
                key={sender.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card className={getStatusBg(sender.status)}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(sender.status)}`} />
                          <h3 className="font-semibold text-lg">{sender.displayName}</h3>
                          <span className="text-sm px-2 py-1 bg-white/50 dark:bg-black/20 rounded">
                            {sender.phoneNumber}
                          </span>
                        </div>
                        <p className={`text-sm font-medium ${getStatusColor(sender.status)}`}>
                          {sender.status === "connected" && "🟢 Terhubung"}
                          {sender.status === "connecting" && "🟡 Menghubungkan..."}
                          {sender.status === "disconnected" && "⚫ Terputus"}
                          {sender.status === "error" && "🔴 Error"}
                        </p>
                        {sender.errorMessage && (
                          <p className="text-xs text-red-600 mt-1">Error: {sender.errorMessage}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reconnectSender.mutate(sender.id)}
                          disabled={reconnectSender.isPending}
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
            ))
          )}
        </div>
      )}

      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold mb-4">Tambah WhatsApp Sender</h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Nama Penampilan</label>
                  <Input
                    placeholder="Contoh: Sender Utama"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Nomor WhatsApp</label>
                  <Input
                    placeholder="62812345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">Gunakan format: 62XXXXXXXXXX (tanpa +)</p>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-3 mb-6 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">📱 Instruksi:</p>
                <p className="text-blue-800 dark:text-blue-200 text-xs mt-1">
                  Setelah klik "Tambah", scan QR Code yang muncul di console/terminal dengan WhatsApp Anda.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1"
                >
                  Batal
                </Button>
                <Button
                  onClick={() =>
                    addSender.mutate({
                      phoneNumber,
                      displayName,
                    })
                  }
                  disabled={!phoneNumber || !displayName || addSender.isPending}
                  className="flex-1"
                >
                  {addSender.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Tambah
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
