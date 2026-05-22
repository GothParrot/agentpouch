import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const tokenKindEnum = pgEnum("token_kind", ["bootstrap", "api_key", "guest_session"]);
export const directionEnum = pgEnum("direction", ["ingest", "serve"]);
export const uploadRequestStatusEnum = pgEnum("upload_request_status", [
  "pending",
  "completed",
  "expired",
]);
export const eventTypeEnum = pgEnum("event_type", [
  "created",
  "accessed",
  "revoked",
  "deleted",
  "expired",
]);

// ---------------------------------------------------------------------------
// tenants — multi-tenant hosted offering; ignored in single-tenant self-host
// ---------------------------------------------------------------------------

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// accounts — hosted offering; ignored in simple self-host
// ---------------------------------------------------------------------------

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// tokens / api_keys
// ---------------------------------------------------------------------------

export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    name: text("name"),
    kind: tokenKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // plan caps — null means use server default
    maxFileSizeBytes: numeric("max_file_size_bytes"),
    allowedMimeTypes: text("allowed_mime_types").array(),
    storageQuotaBytes: numeric("storage_quota_bytes"),
    storageUsedBytes: numeric("storage_used_bytes").notNull().default("0"),
    rateLimitRpm: integer("rate_limit_rpm"),
  },
  (t) => [index("tokens_account_id_idx").on(t.accountId)],
);

// ---------------------------------------------------------------------------
// blobs — content-addressed, deduped physical storage
// ---------------------------------------------------------------------------

export const blobs = pgTable("blobs", {
  sha256: text("sha256").primaryKey(),
  sizeBytes: numeric("size_bytes").notNull(),
  mimeType: text("mime_type").notNull(),
  storageBackend: text("storage_backend").notNull(),
  storageKey: text("storage_key").notNull(),
  refCount: integer("ref_count").notNull().default(0),
  encryptionContext: jsonb("encryption_context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// references — agent-facing file handles
// ---------------------------------------------------------------------------

export const references = pgTable(
  "references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id").references(() => tokens.id, { onDelete: "set null" }),
    blobSha256: text("blob_sha256")
      .notNull()
      .references(() => blobs.sha256, { onDelete: "restrict" }),
    shortid: text("shortid").notNull().unique(),
    filename: text("filename").notNull(),
    direction: directionEnum("direction").notNull().default("serve"),
    scope: text("scope"),
    idempotencyKey: text("idempotency_key"),
    runId: text("run_id"),
    step: text("step"),
    producer: text("producer"),
    consumer: text("consumer"),
    intent: text("intent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    passwordHash: text("password_hash"),
    maxDownloads: integer("max_downloads"),
    downloadCount: integer("download_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("references_shortid_idx").on(t.shortid),
    index("references_tenant_scope_idx").on(t.tenantId, t.scope),
    index("references_tenant_run_id_idx").on(t.tenantId, t.runId),
    index("references_blob_sha256_idx").on(t.blobSha256),
    index("references_expires_at_idx").on(t.expiresAt),
    unique("references_token_idempotency_key_unique").on(t.tokenId, t.idempotencyKey),
  ],
);

// ---------------------------------------------------------------------------
// upload_requests — human-facing upload entry points created by agents
// ---------------------------------------------------------------------------

export const uploadRequests = pgTable(
  "upload_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id").references(() => tokens.id, { onDelete: "set null" }),
    shortid: text("shortid").notNull().unique(),
    filenameHint: text("filename_hint"),
    scope: text("scope"),
    runId: text("run_id"),
    step: text("step"),
    producer: text("producer"),
    consumer: text("consumer"),
    intent: text("intent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    allowedMimeTypes: text("allowed_mime_types").array(),
    maxFileSizeBytes: numeric("max_file_size_bytes"),
    // locked to 1 in v0; column preserved for future multi-upload support
    maxUploads: integer("max_uploads").default(1),
    uploadCount: integer("upload_count").notNull().default(0),
    status: uploadRequestStatusEnum("status").notNull().default("pending"),
    fulfilledReferenceId: uuid("fulfilled_reference_id").references(() => references.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("upload_requests_shortid_idx").on(t.shortid),
    index("upload_requests_tenant_scope_idx").on(t.tenantId, t.scope),
    index("upload_requests_tenant_run_id_idx").on(t.tenantId, t.runId),
    index("upload_requests_status_expires_at_idx").on(t.status, t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// access_events — append-only audit log (partitioned by created_at)
// ---------------------------------------------------------------------------

export const accessEvents = pgTable(
  "access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    referenceId: uuid("reference_id")
      .notNull()
      .references(() => references.id, { onDelete: "cascade" }),
    eventType: eventTypeEnum("event_type").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("access_events_reference_id_idx").on(t.referenceId),
    index("access_events_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// webhooks — optional outbound event delivery
// ---------------------------------------------------------------------------

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  tokenId: uuid("token_id").references(() => tokens.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;

export type Blob = typeof blobs.$inferSelect;
export type NewBlob = typeof blobs.$inferInsert;

export type Reference = typeof references.$inferSelect;
export type NewReference = typeof references.$inferInsert;

export type UploadRequest = typeof uploadRequests.$inferSelect;
export type NewUploadRequest = typeof uploadRequests.$inferInsert;

export type AccessEvent = typeof accessEvents.$inferSelect;
export type NewAccessEvent = typeof accessEvents.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
