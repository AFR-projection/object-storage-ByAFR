"use client";

import { ConnectionHub } from "@/components/integrations/connection-hub";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Crown } from "lucide-react";

export default function AdminIntegrationsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform Integrations"
        subtitle="Copy MCP URL, OAuth login, API keys — satu halaman untuk semua metode connect"
        actions={
          <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            <Crown className="h-3.5 w-3.5" />
            Per-master keys (skm_)
          </div>
        }
      />
      <ConnectionHub tier="master" apiKeyHint="skm_" />
    </div>
  );
}
