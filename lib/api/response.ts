import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { SECURITY_HEADERS } from "@/lib/security";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: SECURITY_HEADERS });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: SECURITY_HEADERS });
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return apiError(error.message, error.status);
  }
  console.error(error);
  return apiError("Internal server error", 500);
}
