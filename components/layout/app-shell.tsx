import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ImpersonationBanner } from "./impersonation-banner";
import { CommandPalette } from "./command-palette";
import { ClientShell } from "./client-shell";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <ClientShell
      user={{
        username: user.username,
        role: user.role,
        quotaBytes: user.quotaBytes,
        usedBytes: user.usedBytes,
        isImpersonating: user.isImpersonating,
      }}
    >
      <CommandPalette />
      {user.isImpersonating && <ImpersonationBanner />}
      <div className="p-4 sm:p-6 lg:p-8">{children}</div>
    </ClientShell>
  );
}
