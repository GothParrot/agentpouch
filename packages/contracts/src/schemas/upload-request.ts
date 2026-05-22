import { z } from "@hono/zod-openapi";
import { UploadRequestStatus } from "../shared.js";
import { ReferenceSchema } from "./reference.js";

export const UploadRequestSchema = z
  .object({
    id: z.string().uuid(),
    shortid: z.string(),
    upload_link: z.string().url(),
    status: UploadRequestStatus,
    filename_hint: z.string().nullable(),
    scope: z.string().nullable(),
    run_id: z.string().nullable(),
    step: z.string().nullable(),
    producer: z.string().nullable(),
    consumer: z.string().nullable(),
    intent: z.string().nullable(),
    expires_at: z.string().datetime(),
    allowed_mime_types: z.array(z.string()).nullable(),
    max_file_size_bytes: z.number().int().nonnegative().nullable(),
    upload_count: z.number().int().nonnegative(),
    fulfilled_reference_id: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi("UploadRequest");

export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export const UploadRequestWithFileSchema = UploadRequestSchema.extend({
  file: ReferenceSchema.optional(),
}).openapi("UploadRequestWithFile");

export type UploadRequestWithFile = z.infer<typeof UploadRequestWithFileSchema>;
