import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../schemas/error.js";
import { ReferenceSchema } from "../schemas/reference.js";
import { Direction, ExpiryPreset, ProvenanceFields } from "../shared.js";

const IngestCommonFields = ProvenanceFields.extend({
  filename: z.string().optional(),
  direction: Direction.optional().default("serve"),
  expires_in: ExpiryPreset.optional(),
  max_downloads: z.coerce.number().int().positive().optional(),
  password: z.string().optional(),
});

export const IngestFormSchema = IngestCommonFields.extend({
  file: z.any().openapi({ type: "string", format: "binary", description: "File bytes" }),
}).openapi("IngestForm");

export const IngestUrlSchema = IngestCommonFields.extend({
  url: z.string().url().openapi({ description: "URL to fetch server-side" }),
}).openapi("IngestUrl");

export type IngestForm = z.infer<typeof IngestFormSchema>;
export type IngestUrl = z.infer<typeof IngestUrlSchema>;

const errorResponses = {
  400: {
    content: { "application/json": { schema: ErrorSchema } },
    description: "Bad request — validation error or unsupported expiry preset",
  },
  401: {
    content: { "application/json": { schema: ErrorSchema } },
    description: "Unauthorized",
  },
  413: {
    content: { "application/json": { schema: ErrorSchema } },
    description: "File exceeds size cap for this token or plan",
  },
  415: {
    content: { "application/json": { schema: ErrorSchema } },
    description: "MIME type not allowed",
  },
  429: {
    content: { "application/json": { schema: ErrorSchema } },
    description: "Rate limit or quota exceeded",
  },
} as const;

export const ingestRoute = createRoute({
  method: "post",
  path: "/v1/ingest",
  tags: ["files"],
  summary: "Upload or fetch a file",
  description:
    "Accepts multipart/form-data (file upload), application/json (URL fetch), " +
    "or application/octet-stream (raw bytes). Returns a Reference with agent_link and human_link.",
  request: {
    headers: z.object({
      "idempotency-key": z.string().optional().openapi({ description: "Per-token dedup key" }),
    }),
    body: {
      content: {
        "multipart/form-data": { schema: IngestFormSchema },
        "application/json": { schema: IngestUrlSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ReferenceSchema } },
      description: "File ingested — reference created",
    },
    ...errorResponses,
  },
});
