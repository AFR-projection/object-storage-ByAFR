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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["master", "user"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
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
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    status: userStatusEnum("status").notNull().default("active"),
    quotaBytes: bigint("quota_bytes", { mode: "number" }).notNull().default(10737418240),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_email_unique").on(table.email),
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
    impersonatingUserId: uuid("impersonating_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("files_user_id_idx").on(table.userId),
    index("files_folder_id_idx").on(table.folderId),
    index("files_user_active_idx").on(table.userId, table.deletedAt),
    index("files_r2_key_idx").on(table.r2Key),
    index("files_favorite_idx").on(table.userId, table.isFavorite),
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
