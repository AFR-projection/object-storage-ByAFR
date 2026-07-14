import { AppShell } from "@/components/layout/app-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AdminTabs>{children}</AdminTabs>
    </AppShell>
  );
}
