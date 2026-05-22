CREATE TYPE "public"."direction" AS ENUM('ingest', 'serve');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('created', 'accessed', 'revoked', 'deleted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."token_kind" AS ENUM('bootstrap', 'api_key', 'guest_session');--> statement-breakpoint
CREATE TYPE "public"."upload_request_status" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"reference_id" uuid NOT NULL,
	"event_type" "event_type" NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"username" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"sha256" text PRIMARY KEY NOT NULL,
	"size_bytes" numeric NOT NULL,
	"mime_type" text NOT NULL,
	"storage_backend" text NOT NULL,
	"storage_key" text NOT NULL,
	"ref_count" integer DEFAULT 0 NOT NULL,
	"encryption_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"account_id" uuid,
	"token_id" uuid,
	"blob_sha256" text NOT NULL,
	"shortid" text NOT NULL,
	"filename" text NOT NULL,
	"direction" "direction" DEFAULT 'serve' NOT NULL,
	"scope" text,
	"idempotency_key" text,
	"run_id" text,
	"step" text,
	"producer" text,
	"consumer" text,
	"intent" text,
	"expires_at" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"password_hash" text,
	"max_downloads" integer,
	"download_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "references_shortid_unique" UNIQUE("shortid"),
	CONSTRAINT "references_token_idempotency_key_unique" UNIQUE("token_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"account_id" uuid,
	"token_hash" text NOT NULL,
	"name" text,
	"kind" "token_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"max_file_size_bytes" numeric,
	"allowed_mime_types" text[],
	"storage_quota_bytes" numeric,
	"storage_used_bytes" numeric DEFAULT '0' NOT NULL,
	"rate_limit_rpm" integer,
	CONSTRAINT "tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "upload_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"account_id" uuid,
	"token_id" uuid,
	"shortid" text NOT NULL,
	"filename_hint" text,
	"scope" text,
	"run_id" text,
	"step" text,
	"producer" text,
	"consumer" text,
	"intent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"allowed_mime_types" text[],
	"max_file_size_bytes" numeric,
	"max_uploads" integer DEFAULT 1,
	"upload_count" integer DEFAULT 0 NOT NULL,
	"status" "upload_request_status" DEFAULT 'pending' NOT NULL,
	"fulfilled_reference_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_requests_shortid_unique" UNIQUE("shortid")
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"account_id" uuid,
	"token_id" uuid,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_blob_sha256_blobs_sha256_fk" FOREIGN KEY ("blob_sha256") REFERENCES "public"."blobs"("sha256") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_fulfilled_reference_id_references_id_fk" FOREIGN KEY ("fulfilled_reference_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_events_reference_id_idx" ON "access_events" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "access_events_created_at_idx" ON "access_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "references_shortid_idx" ON "references" USING btree ("shortid");--> statement-breakpoint
CREATE INDEX "references_tenant_scope_idx" ON "references" USING btree ("tenant_id","scope");--> statement-breakpoint
CREATE INDEX "references_tenant_run_id_idx" ON "references" USING btree ("tenant_id","run_id");--> statement-breakpoint
CREATE INDEX "references_blob_sha256_idx" ON "references" USING btree ("blob_sha256");--> statement-breakpoint
CREATE INDEX "references_expires_at_idx" ON "references" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tokens_account_id_idx" ON "tokens" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "upload_requests_shortid_idx" ON "upload_requests" USING btree ("shortid");--> statement-breakpoint
CREATE INDEX "upload_requests_tenant_scope_idx" ON "upload_requests" USING btree ("tenant_id","scope");--> statement-breakpoint
CREATE INDEX "upload_requests_tenant_run_id_idx" ON "upload_requests" USING btree ("tenant_id","run_id");--> statement-breakpoint
CREATE INDEX "upload_requests_status_expires_at_idx" ON "upload_requests" USING btree ("status","expires_at");