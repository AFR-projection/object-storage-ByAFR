import {
  pgTable,
  text,
  timestamp,
  uuid,
  bigint,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql, type SQL } from "drizzle-orm";

/**
 * PostgreSQL `tsvector` column type for full-text search. Not represented in JS
 * (we never read it directly) — Postgres computes it from a generated expression
 * and we query it via the FTS helpers in lib/search/fts.ts.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const userRoleEnum = pgEnum("user_role", ["master", "user"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const waStatusEnum = pgEnum("wa_status", ["connecting", "connected", "disconnected", "error"]);
export const sharePermissionEnum = pgEnum("share_permission", ["view", "edit"]);
export const activityActionEnum = pgEnum("activity_action", [
  "login",
  "logout",
  "upload",
  "download",
  "delete",
  "restore",
  "share",
  "edit",
  "rename",
  "move",
  "copy",
  "create_folder",
  "delete_folder",
  "impersonate",
  "create_user",
  "update_user",
  "delete_user",
  "suspend_user",
  "favorite",
  "account_lock",
  "ip_rate_limit",
  "session_revoked",
  "password_change",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    status: userStatusEnum("status").notNull().default("active"),
    quotaBytes: bigint("quota_bytes", { mode: "number" }).notNull().default(10737418240),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    suspendReason: text("suspend_reason"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    totpRecoveryCodes: jsonb("totp_recovery_codes").$type<string[]>().default([]),
    bandwidthQuotaBytes: bigint("bandwidth_quota_bytes", { mode: "number" }).notNull().default(0),
    bandwidthUsedBytes: bigint("bandwidth_used_bytes", { mode: "number" }).notNull().default(0),
    bandwidthPeriodStart: timestamp("bandwidth_period_start", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_phone_unique").on(table.phone),
    index("users_role_idx").on(table.role),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    deviceLabel: text("device_label"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    impersonatingUserId: uuid("impersonating_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
    index("sessions_last_active_idx").on(table.lastActiveAt),
  ]
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    materializedPath: text("materialized_path").notNull(),
    depth: integer("depth").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("folders_user_id_idx").on(table.userId),
    index("folders_parent_id_idx").on(table.parentId),
    index("folders_path_idx").on(table.userId, table.materializedPath),
    index("folders_user_active_idx").on(table.userId, table.deletedAt),
  ]
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    r2Key: text("r2_key").notNull(),
    checksumSha256: text("checksum_sha256"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    isNote: boolean("is_note").notNull().default(false),
    thumbnailKey: text("thumbnail_key"),
    // Searchable body text: note plaintext today; extracted PDF/Office text later
    // (Phase B). Kept separate from name so the FTS vector can weight them.
    contentText: text("content_text"),
    // Generated full-text search vector: name (weight A) + contentText (weight B).
    // STORED so it is computed on write by Postgres — no trigger, never stale.
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple', coalesce(${files.name}, '')), 'A') || setweight(to_tsvector('simple', coalesce(${files.contentText}, '')), 'B')`
    ),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    encrypted: boolean("encrypted").notNull().default(false),
    encryptionMeta: jsonb("encryption_meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("files_user_id_idx").on(table.userId),
    index("files_folder_id_idx").on(table.folderId),
    index("files_user_active_idx").on(table.userId, table.deletedAt),
    index("files_r2_key_idx").on(table.r2Key),
    index("files_favorite_idx").on(table.userId, table.isFavorite),
    // GIN index makes tsvector @@ tsquery lookups fast.
    index("files_search_vector_idx").using("gin", table.searchVector),
  ]
);

export const fileContents = pgTable(
  "file_contents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    contentJson: jsonb("content_json"),
    annotationsJson: jsonb("annotations_json"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("file_contents_file_id_unique").on(table.fileId)]
);

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    sharedBy: uuid("shared_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    permission: sharePermissionEnum("permission").notNull().default("view"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    accessCount: integer("access_count").notNull().default(0),
    maxAccessCount: integer("max_access_count"),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("shares_token_unique").on(table.token),
    index("shares_file_id_idx").on(table.fileId),
    index("shares_expires_idx").on(table.expiresAt),
    index("shares_max_access_idx").on(table.maxAccessCount),
  ]
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: activityActionEnum("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_logs_user_time_idx").on(table.userId, table.createdAt),
    index("activity_logs_action_idx").on(table.action),
    index("activity_logs_created_at_idx").on(table.createdAt),
  ]
);

export const changeHistory = pgTable(
  "change_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    changeType: text("change_type").notNull(),
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("change_history_file_id_idx").on(table.fileId),
    index("change_history_user_id_idx").on(table.userId),
  ]
);

/** Single-row platform settings (Admin → Settings). */
export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("default"),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const folderMemberRoleEnum = pgEnum("folder_member_role", ["view", "edit"]);

export const folderMembers = pgTable(
  "folder_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: folderMemberRoleEnum("role").notNull().default("view"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("folder_members_unique").on(table.folderId, table.userId),
    index("folder_members_user_idx").on(table.userId),
  ]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default(["read"]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_user_idx").on(table.userId),
    uniqueIndex("api_keys_prefix_unique").on(table.keyPrefix),
  ]
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default(["upload", "delete", "share"]),
    enabled: boolean("enabled").notNull().default(true),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastStatus: integer("last_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("webhooks_user_idx").on(table.userId)]
);

export const fileVersions = pgTable(
  "file_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    r2Key: text("r2_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    checksumSha256: text("checksum_sha256"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("file_versions_file_idx").on(table.fileId),
    uniqueIndex("file_versions_unique").on(table.fileId, table.version),
  ]
);

export const whatsappSenders = pgTable(
  "whatsapp_senders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    displayName: text("display_name").notNull(),
    status: waStatusEnum("status").notNull().default("disconnected"),
    isActive: boolean("is_active").notNull().default(true),
    sessionData: jsonb("session_data").$type<Record<string, unknown>>(),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wa_senders_phone_unique").on(table.phoneNumber),
    index("wa_senders_status_idx").on(table.status),
    index("wa_senders_active_idx").on(table.isActive),
  ]
);

export const otpTokens = pgTable(
  "otp_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    code: text("code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verified: boolean("verified").notNull().default(false),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("otp_tokens_phone_idx").on(table.phoneNumber),
    index("otp_tokens_expires_idx").on(table.expiresAt),
  ]
);

/**
 * Pairing handshake for WhatsApp registration. The user is shown `code` in the
 * browser and must reply with it to the sender, proving they control both the
 * browser session and the WhatsApp number before any OTP is issued.
 */
export const waPairings = pgTable(
  "wa_pairings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    code: text("code").notNull(),
    verified: boolean("verified").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wa_pairings_phone_idx").on(table.phoneNumber),
    index("wa_pairings_expires_idx").on(table.expiresAt),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  folders: many(folders),
  files: many(files),
  activityLogs: many(activityLogs),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, { fields: [folders.userId], references: [users.id] }),
  parent: one(folders, { fields: [folders.parentId], references: [folders.id] }),
  files: many(files),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, { fields: [files.userId], references: [users.id] }),
  folder: one(folders, { fields: [files.folderId], references: [folders.id] }),
  content: one(fileContents),
  shares: many(shares),
  changeHistory: many(changeHistory),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type File = typeof files.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type WhatsappSender = typeof whatsappSenders.$inferSelect;
export type OtpToken = typeof otpTokens.$inferSelect;
export type WaPairing = typeof waPairings.$inferSelect;
