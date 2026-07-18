"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ConnectionHub } from "@/components/integrations/connection-hub";
import { Button } from "@/components/ui/button";

export default function UserIntegrationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 h-8" asChild>
          <Link href="/settings">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Link>
        </Button>
        <h1 className="text-2xl font-bold sm:text-3xl">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Storage ByAFR to AI agents, automation, and other platforms — pilih cara yang paling cocok.
        </p>
      </div>
      <ConnectionHub tier="user" apiKeyHint="sk_" />
    </div>
  );
}
