import type { SessionUser } from "./session";

export function isMaster(user: SessionUser): boolean {
  return user.role === "master";
}

export function canAccessUserResource(
  user: SessionUser,
  resourceUserId: string
): boolean {
  if (user.role === "master") return true;
  return user.effectiveUserId === resourceUserId;
}

export function getEffectiveUserId(user: SessionUser): string {
  return user.effectiveUserId;
}
