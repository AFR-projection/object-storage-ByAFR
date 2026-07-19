import { redirect } from "next/navigation";

export default function AdminApiKeysRedirect() {
  redirect("/connection?section=keys");
}
