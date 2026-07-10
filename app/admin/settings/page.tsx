"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings2,
  Shield,
  HardDrive,
  Timer,
  Upload,
  Ban,
  Mail,
  Database,
  Download,
  Gauge,
  Globe,
  Lock,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Clock,
  Users,
  FileWarning,
  Sliders,
  Wifi,
  Server,
  RefreshCw,
  Bell,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import type { AdminSettings } from "@/app/api/admin/settings/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

// ─── Section Definition ──────────────────────────────────────────────────────

interface SettingField {
  key: keyof AdminSettings;
  label: string;
  description: string;
  type: "text" | "number" | "toggle" | "select" | "tags" | "password";
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  sensitive?: boolean;
}

interface Section {
  id: string;
  title: string;
  description: string;
  icon: typeof Shield;
  gradient: string;
  fields: SettingField[];
}

const SETTING_SECTIONS: Section[] = [
  {
    id: "general",
    title: "General",
    description: "Core platform settings and maintenance controls",
    icon: Settings2,
    gradient: "from-slate-500 to-zinc-500",
    fields: [
      { key: "registrationEnabled", label: "Allow Registration", description: "Allow new users to sign up", type: "toggle" },
      { key: "maintenanceMode", label: "Maintenance Mode", description: "Block all user access except admins", type: "toggle" },
      { key: "maintenanceMessage", label: "Maintenance Message", description: "Message shown to users during maintenance", type: "text", placeholder: "System is under maintenance..." },
    ],
  },
  {
    id: "storage",
    title: "Storage",
    description: "Quota limits and file size restrictions",
    icon: HardDrive,
    gradient: "from-emerald-500 to-teal-500",
    fields: [
      { key: "defaultQuotaGB", label: "Default Quota", description: "Storage quota for new users", type: "number", unit: "GB", min: 1, max: 10000 },
      { key: "maxUploadSizeMB", label: "Max Upload Size", description: "Maximum file size per upload", type: "number", unit: "MB", min: 1, max: 5120 },
      { key: "storageWarningThreshold", label: "Warning Threshold", description: "Notify users when storage exceeds this percentage", type: "number", unit: "%", min: 50, max: 100 },
    ],
  },
  {
    id: "security",
    title: "Security",
    description: "Session, access and rate limiting controls",
    icon: Shield,
    gradient: "from-violet-500 to-fuchsia-500",
    fields: [
      { key: "sessionDurationHours", label: "Session Duration", description: "How long a session stays active", type: "number", unit: "hours", min: 1, max: 8760 },
      { key: "maxSessionsPerUser", label: "Max Sessions", description: "Concurrent sessions per user", type: "number", unit: "sessions", min: 1, max: 100 },
      { key: "rateLimitPerMinute", label: "Rate Limit", description: "API requests per minute per user", type: "number", unit: "req/min", min: 10, max: 1000 },
    ],
  },
  {
    id: "files",
    title: "Files",
    description: "File policies, expiration and cleanup rules",
    icon: FileWarning,
    gradient: "from-amber-500 to-orange-500",
    fields: [
      { key: "maxFileLifetimeDays", label: "Max File Lifetime", description: "Auto-delete files after this many days (0 = unlimited)", type: "number", unit: "days", min: 0, max: 3650 },
      { key: "autoDeleteTrashDays", label: "Auto Delete Trash", description: "Automatically empty trash after this many days", type: "number", unit: "days", min: 0, max: 365 },
      { key: "blockedExtensions", label: "Blocked Extensions", description: "File extensions blocked from upload", type: "tags", placeholder: ".exe" },
      { key: "allowedMimeTypes", label: "Allowed MIME Types", description: "Restrict by MIME type (*/* for all)", type: "tags", placeholder: "image/*" },
    ],
  },
  {
    id: "retention",
    title: "Retention",
    description: "Data retention and backup configuration",
    icon: Database,
    gradient: "from-blue-500 to-cyan-500",
    fields: [
      { key: "logRetentionDays", label: "Log Retention", description: "How long to keep activity logs", type: "number", unit: "days", min: 7, max: 730 },
      { key: "backupEnabled", label: "Backup Enabled", description: "Enable automated backups", type: "toggle" },
      { key: "backupSchedule", label: "Backup Schedule", description: "How often to run backups", type: "select", options: [
        { label: "Daily", value: "daily" },
        { label: "Weekly", value: "weekly" },
        { label: "Monthly", value: "monthly" },
      ]},
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Email and alert configuration",
    icon: Bell,
    gradient: "from-rose-500 to-pink-500",
    fields: [
      { key: "smtpConfigured", label: "SMTP Configured", description: "Email server is set up for notifications", type: "toggle" },
    ],
  },
];

// ─── Tags Input ───────────────────────────────────────────────────────────────

function TagsInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInput("");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
            {tag}
            <button onClick={() => onChange(value.filter((t) => t !== tag))} className="hover:text-accent/60" aria-label={`Remove ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder ? `Add ${placeholder}...` : "Add value..."}
          className="h-8 text-xs"
        />
        <Button variant="secondary" size="sm" className="h-8 shrink-0" onClick={addTag} type="button">Add</Button>
      </div>
    </div>
  );
}

// ─── Settings Field ───────────────────────────────────────────────────────────

function SettingsField({ field, value, onChange, meta }: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
  meta?: { totalUsers?: number };
}) {
  const [showSensitive, setShowSensitive] = useState(false);

  switch (field.type) {
    case "toggle":
      return (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{field.label}</p>
            <p className="text-xs text-muted-foreground/60">{field.description}</p>
          </div>
          <ToggleSwitch value={!!value} onChange={(v) => onChange(v)} />
        </div>
      );

    case "number":
      return (
        <div>
          <label className="mb-1.5 block text-sm font-medium">{field.label}</label>
          <p className="text-xs text-muted-foreground/60 mb-2">{field.description}</p>
          <div className="relative max-w-[200px]">
            <Input
              type="number"
              value={Number(value) || 0}
              min={field.min}
              max={field.max}
              step={field.step}
              onChange={(e) => onChange(Number(e.target.value))}
              className="h-9 pr-10 text-sm"
            />
            {field.unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50 font-medium">{field.unit}</span>
            )}
          </div>
        </div>
      );

    case "select":
      return (
        <div>
          <label className="mb-1.5 block text-sm font-medium">{field.label}</label>
          <p className="text-xs text-muted-foreground/60 mb-2">{field.description}</p>
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="flex h-9 w-full max-w-[200px] rounded-xl border border-border/50 bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      );

    case "tags":
      return (
        <div>
          <label className="mb-1.5 block text-sm font-medium">{field.label}</label>
          <p className="text-xs text-muted-foreground/60 mb-2">{field.description}</p>
          <TagsInput
            value={(value as string[]) ?? []}
            onChange={(v) => onChange(v)}
            placeholder={typeof field.placeholder === "string" ? field.placeholder : undefined}
          />
        </div>
      );

    default:
      return (
        <div>
          <label className="mb-1.5 block text-sm font-medium">{field.label}</label>
          <p className="text-xs text-muted-foreground/60 mb-2">{field.description}</p>
          <div className="relative max-w-sm">
            <Input
              type={field.sensitive && !showSensitive ? "password" : "text"}
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              className="h-9 text-sm pr-9"
            />
            {field.sensitive && (
              <button
                type="button"
                onClick={() => setShowSensitive(!showSensitive)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                aria-label={showSensitive ? "Hide" : "Show"}
              >
                {showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      );
  }
}

// ─── Settings Section ─────────────────────────────────────────────────────────

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        value ? "bg-accent" : "bg-muted-foreground/20"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
        value ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

function SettingsSection({ section, values, onChange, isOpen, onToggle, index }: {
  section: Section;
  values: AdminSettings;
  onChange: (key: keyof AdminSettings, value: unknown) => void;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  const Icon = section.icon;

  return (
    <motion.div
      layout
      className="rounded-2xl border border-border/50 bg-surface/80 backdrop-blur-sm overflow-hidden hover:border-accent/20 transition-all duration-300"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-accent/5"
      >
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br", section.gradient)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold">{section.title}</h3>
            <p className="text-xs text-muted-foreground/60">{section.description}</p>
          </div>
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground/40 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 px-6 py-5 space-y-5">
              {section.fields.map((field) => (
                <div key={field.key as string}>
                  <SettingsField
                    field={field}
                    value={values[field.key]}
                    onChange={(v) => onChange(field.key, v)}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-48 skeleton rounded-lg" />
      <div className="h-8 w-72 skeleton rounded-lg" />
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 skeleton rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const sections = SETTING_SECTIONS;

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<AdminSettings | null>(null);
  const [openSection, setOpenSection] = useState("general");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const res = await apiFetch<AdminSettings & { _meta?: { totalUsers?: number } }>("/api/admin/settings");
      return res.data;
    },
  });

  useEffect(() => {
    if (data && !values) {
      setValues(data);
    }
  }, [data, values]);

  const saveMutation = useMutation({
    mutationFn: async (settings: AdminSettings) => {
      const res = await apiFetch<AdminSettings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to save settings");
      return res.data;
    },
    onSuccess: () => {
      setSuccessMsg("Settings saved successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(""), 4000);
    },
  });

  function handleChange(key: keyof AdminSettings, value: unknown) {
    setValues((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function handleReset() {
    setValues(null);
    queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
  }

  if (isLoading && !values) return <SettingsSkeleton />;

  const meta = data?._meta as { totalUsers?: number } | undefined;

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
            <Sliders className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground/60">Configure system-wide preferences and policies</p>
          </div>
        </div>
      </motion.div>

      {/* System Info Bar */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border/40 bg-accent/5 px-5 py-3"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Server className="h-3.5 w-3.5 text-accent" />
          <span className="font-medium">System Health:</span>
          <span className="inline-flex items-center gap-1 text-emerald-500">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Online
          </span>
        </div>
        {meta?.totalUsers !== undefined && (
          <>
            <span className="hidden sm:inline text-muted-foreground/30">|</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{meta.totalUsers} users</span>
            </div>
          </>
        )}
        <span className="hidden sm:inline text-muted-foreground/30">|</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          Changes take effect immediately
        </div>
        {values?.maintenanceMode && (
          <>
            <span className="text-muted-foreground/30">|</span>
            <div className="flex items-center gap-1.5 text-xs text-amber-500">
              <AlertCircle className="h-3.5 w-3.5" />
              Maintenance mode active
            </div>
          </>
        )}
      </motion.div>

      {/* Messages */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMsg}
          </motion.div>
        )}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500"
          >
            <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Sections */}
      {values && (
        <div className="space-y-3">
          {sections.map((section, idx) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <SettingsSection
                section={section}
                index={idx}
                values={values}
                onChange={handleChange}
                isOpen={openSection === section.id}
                onToggle={() => setOpenSection(openSection === section.id ? "" : section.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 flex flex-wrap items-center gap-3"
      >
        <Button
          onClick={() => values && saveMutation.mutate(values)}
          disabled={saveMutation.isPending}
          className="gap-2 min-h-[44px]"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
        <Button variant="secondary" onClick={handleReset} disabled={saveMutation.isPending} className="gap-2 min-h-[44px]">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </motion.div>
    </div>
  );
}