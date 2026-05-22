import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../schemas/error.js";
import { UploadRequestSchema, UploadRequestWithFileSchema } from "../schemas/upload-request.js";
import { ExpiryPreset, ProvenanceFields } from "../shared.js";

const unauthorized = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Unauthorized",
} as const;

const notFound = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Upload request not found",
} as const;

const gone = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Upload request expired",
} as const;

export const CreateUploadRequestBodySchema = ProvenanceFields.extend({
  expires_in: ExpiryPreset,
  filename_hint: z.string().optional(),
  allowed_mime_types: z.array(z.string()).optional(),
  max_file_size_bytes: z.number().int().positive().optional(),
}).openapi("CreateUploadRequestBody");

export type CreateUploadRequestBody = z.infer<typeof CreateUploadRequestBodySchema>;

export const createUploadRequestRoute = createRoute({
  method: "post",
  path: "/v1/upload-requests",
  tags: ["upload-requests"],
  summary: "Create an upload request",
  description:
    "Agent creates an upload_link to hand to a human. " +
    "max_uploads is locked to 1 in v0. " +
    "Poll GET /v1/upload-requests/:id for completion.",
  request: {
    body: {
      content: { "application/json": { schema: CreateUploadRequestBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: UploadRequestSchema } },
      description: "Upload request created",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Validation error",
    },
    401: unauthorized,
    429: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Rate limit exceeded",
    },
  },
});

export const getUploadRequestRoute = createRoute({
  method: "get",
  path: "/v1/upload-requests/{id}",
  tags: ["upload-requests"],
  summary: "Poll upload request status",
  description:
    "Returns status (pending | completed | expired) and fulfilled file metadata when completed.",
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: UploadRequestWithFileSchema } },
      description: "Upload request status",
    },
    401: unauthorized,
    404: notFound,
  },
});

export const uploadPageRoute = createRoute({
  method: "get",
  path: "/u/{shortid}",
  tags: ["upload-requests"],
  summary: "Human upload page",
  description: "Server-rendered HTML page for a human to upload a file into an upload request.",
  request: {
    params: z.object({ shortid: z.string() }),
  },
  responses: {
    200: {
      content: { "text/html": { schema: z.any() } },
      description: "Upload form",
    },
    404: notFound,
    410: gone,
  },
});

export const uploadSubmitRoute = createRoute({
  method: "post",
  path: "/u/{shortid}",
  tags: ["upload-requests"],
  summary: "Submit a file to an upload request",
  description:
    "Accepts the browser file upload, runs the normal ingest path, and marks the request completed.",
  request: {
    params: z.object({ shortid: z.string() }),
    body: {
      content: {
        "multipart/form-data": {
          schema: z
            .object({
              file: z.any().openapi({ type: "string", format: "binary" }),
            })
            .openapi("UploadSubmitForm"),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "text/html": { schema: z.any() } },
      description: "Upload complete — confirmation page",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Validation error (file too large, wrong MIME, etc.)",
    },
    404: notFound,
    410: gone,
  },
});
