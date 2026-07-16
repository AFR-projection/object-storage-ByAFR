import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";
import { SECURITY_HEADERS } from "@/lib/security";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: SECURITY_HEADERS });
}

export function apiError(
  message: string,
  status = 400,
  extra?: { code?: string; [key: string]: unknown }
) {
  return NextResponse.json(
    { success: false, error: message, ...(extra ?? {}) },
    { status, headers: SECURITY_HEADERS }
  );
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return apiError(error.message, error.status, {
      ...(error.code ? { code: error.code } : {}),
      ...(error.previousIp ? { previousIp: error.previousIp } : {}),
      ...(error.currentIp ? { currentIp: error.currentIp } : {}),
    });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first?.path.join(".") || "input";
    return apiError(`${field}: ${first?.message ?? "Invalid input"}`, 400, {
      code: "VALIDATION_ERROR",
    });
  }
  console.error(error);
  return apiError("Internal server error", 500);
}

