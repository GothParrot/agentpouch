import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../schemas/error.js";
import { ReferenceListSchema, ReferenceSchema } from "../schemas/reference.js";
import { ExpiryPreset } from "../shared.js";

const FileIdParam = z.object({ id: z.string().uuid() });

const notFound = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "File not found",
} as const;

const gone = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "File expired, revoked, or deleted",
} as const;

const unauthorized = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Unauthorized",
} as const;

export const fileInfoRoute = createRoute({
  method: "get",
  path: "/v1/files/{id}",
  tags: ["files"],
  summary: "Get file metadata",
  request: { params: FileIdParam },
  responses: {
    200: {
      content: { "application/json": { schema: ReferenceSchema } },
      description: "File metadata",
    },
    401: unauthorized,
    404: notFound,
    410: gone,
  },
});

export const fileDownloadRoute = createRoute({
  method: "get",
  path: "/v1/files/{id}/download",
  tags: ["files"],
  summary: "Download file bytes (agent-facing)",
  description:
    "Returns 302 redirect to a presigned URL (S3/R2 backends) or streams bytes (local backend).",
  request: { params: FileIdParam },
  responses: {
    200: {
      content: { "application/octet-stream": { schema: z.any() } },
      description: "File bytes (local storage stream)",
    },
    302: {
      description: "Redirect to presigned download URL (S3/R2 storage)",
      headers: z.object({ Location: z.string().url() }),
    },
    401: unauthorized,
    404: notFound,
    410: gone,
  },
});

export const listFilesRoute = createRoute({
  method: "get",
  path: "/v1/files",
  tags: ["files"],
  summary: "List files",
  request: {
    query: z.object({
      scope: z.string().optional(),
      run_id: z.string().optional(),
      consumer: z.string().optional(),
      intent: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: ReferenceListSchema } },
      description: "File list",
    },
    401: unauthorized,
  },
});

export const revokeFileRoute = createRoute({
  method: "post",
  path: "/v1/files/{id}/revoke",
  tags: ["files"],
  summary: "Revoke a file link",
  description: "Invalidates the link but retains the blob and other references to it.",
  request: { params: FileIdParam },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .object({ id: z.string().uuid(), revoked_at: z.string().datetime() })
            .openapi("RevokeResult"),
        },
      },
      description: "File revoked",
    },
    401: unauthorized,
    404: notFound,
  },
});

export const deleteFileRoute = createRoute({
  method: "delete",
  path: "/v1/files/{id}",
  tags: ["files"],
  summary: "Soft-delete a file",
  description:
    "Sets deleted_at; reference is immediately inaccessible. Blob is retained until reconciliation.",
  request: { params: FileIdParam },
  responses: {
    204: { description: "File soft-deleted" },
    401: unauthorized,
    404: notFound,
  },
});

export const eraseFileRoute = createRoute({
  method: "post",
  path: "/v1/files/{id}/erase",
  tags: ["files"],
  summary: "Hard-delete a file (GDPR)",
  description:
    "Purges the reference row and removes blob bytes from storage if ref_count hits 0. " +
    "Requires elevated auth (bootstrap token or account-owner session). " +
    "Not available to guest sessions or scoped API keys.",
  request: { params: FileIdParam },
  responses: {
    204: { description: "File and bytes erased" },
    401: unauthorized,
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Insufficient privileges for hard delete",
    },
    404: notFound,
  },
});

export const extendFileRoute = createRoute({
  method: "post",
  path: "/v1/files/{id}/extend",
  tags: ["files"],
  summary: "Extend file expiry",
  description: "Pushes expires_at forward using a preset, subject to plan caps.",
  request: {
    params: FileIdParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({ expires_in: ExpiryPreset }).openapi("ExtendFileBody"),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .object({ id: z.string().uuid(), expires_at: z.string().datetime() })
            .openapi("ExtendResult"),
        },
      },
      description: "Expiry extended",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Invalid preset or exceeds plan cap",
    },
    401: unauthorized,
    404: notFound,
  },
});

export const shortLinkRoute = createRoute({
  method: "get",
  path: "/v1/f/{shortid}",
  tags: ["files"],
  summary: "Resolve a human short link",
  description:
    "Checks expiry, revocation, deletion, password, and max-download limits. " +
    "Returns 302 redirect (S3/R2) or serves the file (local). " +
    "Returns 200 HTML page when accessed from a browser without Accept: application/octet-stream.",
  request: {
    params: z.object({ shortid: z.string() }),
    headers: z.object({
      "x-agentpouch-password": z.string().optional().openapi({
        description: "Password for protected files",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "text/html": { schema: z.any() },
        "application/octet-stream": { schema: z.any() },
      },
      description: "File served (local storage stream or HTML download page)",
    },
    302: {
      description: "Redirect to presigned URL (S3/R2 storage)",
      headers: z.object({ Location: z.string().url() }),
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Password required or incorrect",
    },
    404: notFound,
    410: gone,
  },
});
