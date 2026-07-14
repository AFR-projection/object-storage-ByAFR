import { redirect } from "next/navigation";
import { getSessionUserForPage } from "@/lib/auth/session-page";

export default async function HomePage() {
  const user = await getSessionUserForPage();
  redirect(user ? "/dashboard" : "/login");
}
