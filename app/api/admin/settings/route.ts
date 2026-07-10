import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export interface AdminSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  defaultQuotaGB: number;
  maxUploadSizeMB: number;
  allowedMimeTypes: string[];
  blockedExtensions: string[];
  sessionDurationHours: number;
  maxSessionsPerUser: number;
  registrationEnabled: boolean;
  maxFileLifetimeDays: number;
  storageWarningThreshold: number;
  autoDeleteTrashDays: number;
  rateLimitPerMinute: number;
  smtpConfigured: boolean;
  backupEnabled: boolean;
  backupSchedule: string;
  logRetentionDays: number;
}

const DEFAULT_SETTINGS: AdminSettings = {
  maintenanceMode: false,
  maintenanceMessage: "System is under maintenance. Please check back later.",
  defaultQuotaGB: 10,
  maxUploadSizeMB: 500,
  allowedMimeTypes: ["*/*"],
  blockedExtensions: [".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".vbs", ".ps1", ".sh"],
  sessionDurationHours: 168,
  maxSessionsPerUser: 10,
  registrationEnabled: true,
  maxFileLifetimeDays: 0,
  storageWarningThreshold: 85,
  autoDeleteTrashDays: 30,
  rateLimitPerMinute: 60,
  smtpConfigured: false,
  backupEnabled: false,
  backupSchedule: "daily",
  logRetentionDays: 90,
};

let cachedSettings: AdminSettings | null = null;

function getStore() {
  if (typeof globalThis !== "undefined") {
    return (globalThis as Record<string, unknown>).__adminSettings as AdminSettings | undefined;
  }
}

function setStore(s: AdminSettings) {
  if (typeof globalThis !== "undefined") {
    (globalThis as Record<string, unknown>).__adminSettings = s;
  }
}

function loadSettings(): AdminSettings {
  const stored = getStore();
  if (stored) return stored;
  setStore(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "master") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const settings = loadSettings();
  const [userCount] = await db.select({ count: count() }).from(users);

  return NextResponse.json({
    success: true,
    data: {
      ...settings,
      _meta: {
        totalUsers: userCount.count,
        version: "1.0.0",
      },
    },
  });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "master") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const current = loadSettings();

  const updated: AdminSettings = {
    ...DEFAULT_SETTINGS,
    ...current,
    ...body,
    maintenanceMode: body.maintenanceMode ?? current.maintenanceMode ?? false,
    maintenanceMessage: body.maintenanceMessage ?? current.maintenanceMessage ?? "",
    defaultQuotaGB: Math.max(1, Math.min(10000, Number(body.defaultQuotaGB) || current.defaultQuotaGB)),
    maxUploadSizeMB: Math.max(1, Math.min(5120, Number(body.maxUploadSizeMB) || current.maxUploadSizeMB)),
    sessionDurationHours: Math.max(1, Math.min(8760, Number(body.sessionDurationHours) || current.sessionDurationHours)),
    maxSessionsPerUser: Math.max(1, Math.min(100, Number(body.maxSessionsPerUser) || current.maxSessionsPerUser)),
    logRetentionDays: Math.max(7, Math.min(730, Number(body.logRetentionDays) || current.logRetentionDays)),
    autoDeleteTrashDays: Math.max(0, Math.min(365, Number(body.autoDeleteTrashDays) || current.autoDeleteTrashDays)),
    rateLimitPerMinute: Math.max(10, Math.min(1000, Number(body.rateLimitPerMinute) || current.rateLimitPerMinute)),
  };

  setStore(updated);

  return NextResponse.json({ success: true, data: updated });
}