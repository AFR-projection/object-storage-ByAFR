import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function ChangePasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return children;
}
