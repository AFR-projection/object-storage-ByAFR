import { NextResponse } from "next/server";
import { generateCsrfToken, SECURITY_HEADERS } from "@/lib/security";
import { cookieSecure } from "@/lib/env/runtime";

export async function GET() {
  const token = generateCsrfToken();
  const res = NextResponse.json(
    { success: true, data: { token } },
    { headers: SECURITY_HEADERS }
  );
  res.cookies.set("csrf_token", token, {
    httpOnly: false,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
  });
  return res;
}
