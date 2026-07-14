import { NextResponse } from "next/server";
import { generateCsrfToken, SECURITY_HEADERS } from "@/lib/security";

export async function GET() {
  const token = generateCsrfToken();
  const res = NextResponse.json(
    { success: true, data: { token } },
    { headers: SECURITY_HEADERS }
  );
  res.cookies.set("csrf_token", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res;
}
