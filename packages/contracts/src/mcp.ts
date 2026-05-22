import { z } from "@hono/zod-openapi";
import { RunManifestSchema } from "./routes/runs.js";
import { ReferenceListSchema, ReferenceSchema } from "./schemas/reference.js";
import { UploadRequestSchema, UploadRequestWithFileSchema } from "./schemas/upload-request.js";
import { Direction, ExpiryPreset, ProvenanceFields } from "./shared.js";

const ProvenanceOpts = ProvenanceFields.extend({
  expires_in: ExpiryPreset.optional(),
});

// store_file — equivalent to POST /v1/ingest
export const StoreFileInput = ProvenanceOpts.extend({
  filename: z.string().optional(),
  direction: Direction.optional().default("serve"),
  url: z
    .string()
    .url()
    .optional()
    .openapi({ description: "Fetch from URL instead of providing bytes" }),
  max_downloads: z.number().int().positive().optional(),
  password: z.string().optional(),
  idempotency_key: z.string().optional(),
}).openapi("StoreFileInput");
export const StoreFileOutput = ReferenceSchema;
export type StoreFileInput = z.infer<typeof StoreFileInput>;

// create_upload_request — equivalent to POST /v1/upload-requests
export const CreateUploadRequestInput = ProvenanceOpts.extend({
  expires_in: ExpiryPreset,
  filename_hint: z.string().optional(),
  allowed_mime_types: z.array(z.string()).optional(),
  max_file_size_bytes: z.number().int().positive().optional(),
}).openapi("CreateUploadRequestInput");
export const CreateUploadRequestOutput = UploadRequestSchema;
export type CreateUploadRequestInput = z.infer<typeof CreateUploadRequestInput>;

// upload_request_info — equivalent to GET /v1/upload-requests/:id
export const UploadRequestInfoInput = z
  .object({ id: z.string().uuid() })
  .openapi("UploadRequestInfoInput");
export const UploadRequestInfoOutput = UploadRequestWithFileSchema;
export type UploadRequestInfoInput = z.infer<typeof UploadRequestInfoInput>;

// fetch_file — equivalent to GET /v1/files/:id/download
export const FetchFileInput = z
  .object({
    id: z.string().uuid(),
    password: z.string().optional(),
  })
  .openapi("FetchFileInput");
export const FetchFileOutput = z
  .object({
    url: z.string().url().openapi({ description: "Presigned or direct download URL" }),
    file: ReferenceSchema,
  })
  .openapi("FetchFileOutput");
export type FetchFileInput = z.infer<typeof FetchFileInput>;

// file_info — equivalent to GET /v1/files/:id
export const FileInfoInput = z.object({ id: z.string().uuid() }).openapi("FileInfoInput");
export const FileInfoOutput = ReferenceSchema;
export type FileInfoInput = z.infer<typeof FileInfoInput>;

// revoke_file — equivalent to POST /v1/files/:id/revoke
export const RevokeFileInput = z.object({ id: z.string().uuid() }).openapi("RevokeFileInput");
export const RevokeFileOutput = z
  .object({ id: z.string().uuid(), revoked_at: z.string().datetime() })
  .openapi("RevokeFileOutput");
export type RevokeFileInput = z.infer<typeof RevokeFileInput>;

// delete_file — equivalent to DELETE /v1/files/:id (soft delete)
export const DeleteFileInput = z.object({ id: z.string().uuid() }).openapi("DeleteFileInput");
export const DeleteFileOutput = z
  .object({ id: z.string().uuid(), deleted_at: z.string().datetime() })
  .openapi("DeleteFileOutput");
export type DeleteFileInput = z.infer<typeof DeleteFileInput>;

// extend_file_expiry — equivalent to POST /v1/files/:id/extend
export const ExtendFileExpiryInput = z
  .object({ id: z.string().uuid(), expires_in: ExpiryPreset })
  .openapi("ExtendFileExpiryInput");
export const ExtendFileExpiryOutput = z
  .object({ id: z.string().uuid(), expires_at: z.string().datetime() })
  .openapi("ExtendFileExpiryOutput");
export type ExtendFileExpiryInput = z.infer<typeof ExtendFileExpiryInput>;

// list_files — equivalent to GET /v1/files
export const ListFilesInput = z
  .object({
    scope: z.string().optional(),
    run_id: z.string().optional(),
    consumer: z.string().optional(),
    intent: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50).optional(),
    cursor: z.string().optional(),
  })
  .openapi("ListFilesInput");
export const ListFilesOutput = ReferenceListSchema;
export type ListFilesInput = z.infer<typeof ListFilesInput>;

// list_run_artifacts — equivalent to GET /v1/runs/:run_id
export const ListRunArtifactsInput = z
  .object({ run_id: z.string() })
  .openapi("ListRunArtifactsInput");
export const ListRunArtifactsOutput = RunManifestSchema;
export type ListRunArtifactsInput = z.infer<typeof ListRunArtifactsInput>;
