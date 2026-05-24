import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CreateUploadRequestInput,
  DeleteFileInput,
  ExtendFileExpiryInput,
  FetchFileInput,
  FileInfoInput,
  ListFilesInput,
  ListRunArtifactsInput,
  RevokeFileInput,
  StoreFileInput,
  UploadRequestInfoInput,
} from "@agentbox/contracts";
import {
  createUploadRequest,
  deleteFile,
  extendFileExpiry,
  fetchFileInfo,
  ingestFile,
  listFiles,
  listRunArtifacts,
  revokeFile,
  type AuthContext,
  type CoreDeps,
} from "@agentbox/core";

// ─── Shared helpers ───────────────────────────────────────────────────────────

type RefRow = {
  id: string;
  shortid: string;
  filename: string;
  direction: "ingest" | "serve";
  scope: string | null;
  runId: string | null;
  step: string | null;
  producer: string | null;
  consumer: string | null;
  intent: string | null;
  expiresAt: Date | null;
  graceUntil: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  revokedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

type BlobRow = { sha256: string; sizeBytes: string; mimeType: string };

function mapRef(ref: RefRow, blob: BlobRow, publicBaseUrl: string) {
  return {
    id: ref.id,
    shortid: ref.shortid,
    agent_link: `${publicBaseUrl}/v1/files/${ref.id}`,
    human_link: `${publicBaseUrl}/v1/f/${ref.shortid}`,
    sha256: blob.sha256,
    mime: blob.mimeType,
    size: Number(blob.sizeBytes),
    filename: ref.filename,
    direction: ref.direction,
    scope: ref.scope,
    run_id: ref.runId,
    step: ref.step,
    producer: ref.producer,
    consumer: ref.consumer,
    intent: ref.intent,
    expires_at: ref.expiresAt?.toISOString() ?? null,
    grace_until: ref.graceUntil?.toISOString() ?? null,
    max_downloads: ref.maxDownloads,
    download_count: ref.downloadCount,
    revoked_at: ref.revokedAt?.toISOString() ?? null,
    deleted_at: ref.deletedAt?.toISOString() ?? null,
    created_at: ref.createdAt.toISOString(),
  };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

// ─── Server builder ───────────────────────────────────────────────────────────

function buildServer(core: CoreDeps, auth: AuthContext): McpServer {
  const server = new McpServer({ name: "agentbox", version: "0.1.0" });
  const { publicBaseUrl } = core;

  // ── store_file ──────────────────────────────────────────────────────────────
  server.tool(
    "store_file",
    "Fetch a file from a URL and store it. Returns a reference with agent_link and human_link.",
    StoreFileInput.shape,
    async (args) => {
      try {
        if (!args.url) return fail("url is required for store_file in v0");
        const resp = await fetch(args.url);
        if (!resp.ok || !resp.body) return fail(`Failed to fetch URL: HTTP ${resp.status}`);
        const rawCt = resp.headers.get("content-type") ?? "application/octet-stream";
        const mimeType = rawCt.split(";")[0]?.trim() ?? "application/octet-stream";
        const filename =
          args.filename ??
          decodeURIComponent(new URL(args.url).pathname.split("/").pop() ?? "file");

        const { ref, blob } = await ingestFile(core, {
          auth,
          filename,
          mimeType,
          body: resp.body as ReadableStream<Uint8Array>,
          ...(args.idempotency_key !== undefined ? { idempotencyKey: args.idempotency_key } : {}),
          ...(args.expires_in !== undefined ? { expiresIn: args.expires_in } : {}),
          ...(args.scope !== undefined ? { scope: args.scope } : {}),
          ...(args.run_id !== undefined ? { runId: args.run_id } : {}),
          ...(args.step !== undefined ? { step: args.step } : {}),
          ...(args.producer !== undefined ? { producer: args.producer } : {}),
          ...(args.consumer !== undefined ? { consumer: args.consumer } : {}),
          ...(args.intent !== undefined ? { intent: args.intent } : {}),
        });
        return ok(mapRef(ref, blob, publicBaseUrl));
      } catch (e) {
        return fail(e instanceof Error ? e.message : "store_file failed");
      }
    },
  );

  // ── create_upload_request ───────────────────────────────────────────────────
  server.tool(
    "create_upload_request",
    "Create a link for a human to upload a file. Poll upload_request_info to check when completed.",
    CreateUploadRequestInput.shape,
    async (args) => {
      try {
        const req = await createUploadRequest(core, {
          auth,
          expiresIn: args.expires_in,
          ...(args.filename_hint !== undefined ? { filenameHint: args.filename_hint } : {}),
          ...(args.scope !== undefined ? { scope: args.scope } : {}),
          ...(args.run_id !== undefined ? { runId: args.run_id } : {}),
          ...(args.step !== undefined ? { step: args.step } : {}),
          ...(args.producer !== undefined ? { producer: args.producer } : {}),
          ...(args.consumer !== undefined ? { consumer: args.consumer } : {}),
          ...(args.intent !== undefined ? { intent: args.intent } : {}),
          ...(args.allowed_mime_types !== undefined
            ? { allowedMimeTypes: args.allowed_mime_types }
            : {}),
          ...(args.max_file_size_bytes !== undefined
            ? { maxFileSizeBytes: args.max_file_size_bytes }
            : {}),
        });
        return ok({
          id: req.id,
          shortid: req.shortid,
          upload_link: `${publicBaseUrl}/u/${req.shortid}`,
          status: req.status,
          filename_hint: req.filenameHint,
          scope: req.scope,
          run_id: req.runId,
          step: req.step,
          producer: req.producer,
          consumer: req.consumer,
          intent: req.intent,
          expires_at: req.expiresAt.toISOString(),
          allowed_mime_types: req.allowedMimeTypes,
          max_file_size_bytes: req.maxFileSizeBytes !== null ? Number(req.maxFileSizeBytes) : null,
          upload_count: req.uploadCount,
          fulfilled_reference_id: req.fulfilledReferenceId,
          created_at: req.createdAt.toISOString(),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "create_upload_request failed");
      }
    },
  );

  // ── upload_request_info ─────────────────────────────────────────────────────
  server.tool(
    "upload_request_info",
    "Get the status of an upload request. The file field is populated when status is 'completed'.",
    UploadRequestInfoInput.shape,
    async (args) => {
      try {
        const req = await core.db.query.uploadRequests.findFirst({
          where: (t, { eq }) => eq(t.id, args.id),
        });
        if (!req) return fail("Upload request not found");

        const fulfilledId = req.fulfilledReferenceId;
        let file: ReturnType<typeof mapRef> | undefined;
        if (fulfilledId) {
          const ref = await core.db.query.references.findFirst({
            where: (r, { eq }) => eq(r.id, fulfilledId),
          });
          if (ref) {
            const blob = await core.db.query.blobs.findFirst({
              where: (b, { eq }) => eq(b.sha256, ref.blobSha256),
            });
            if (blob) file = mapRef(ref, blob, publicBaseUrl);
          }
        }

        return ok({
          id: req.id,
          shortid: req.shortid,
          upload_link: `${publicBaseUrl}/u/${req.shortid}`,
          status: req.status,
          filename_hint: req.filenameHint,
          scope: req.scope,
          run_id: req.runId,
          step: req.step,
          producer: req.producer,
          consumer: req.consumer,
          intent: req.intent,
          expires_at: req.expiresAt.toISOString(),
          allowed_mime_types: req.allowedMimeTypes,
          max_file_size_bytes: req.maxFileSizeBytes !== null ? Number(req.maxFileSizeBytes) : null,
          upload_count: req.uploadCount,
          fulfilled_reference_id: req.fulfilledReferenceId,
          created_at: req.createdAt.toISOString(),
          ...(file !== undefined ? { file } : {}),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "upload_request_info failed");
      }
    },
  );

  // ── fetch_file ──────────────────────────────────────────────────────────────
  server.tool(
    "fetch_file",
    "Get a download URL for a file. Returns a presigned URL for S3/R2 storage.",
    FetchFileInput.shape,
    async (args) => {
      try {
        const { ref, blob } = await fetchFileInfo(core, { auth, referenceId: args.id });
        const strategy = await core.storage.getServeStrategy(blob.storageKey);
        const url =
          strategy.type === "redirect"
            ? strategy.url
            : `${publicBaseUrl}/v1/files/${ref.id}/download`;
        return ok({ url, file: mapRef(ref, blob, publicBaseUrl) });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "fetch_file failed");
      }
    },
  );

  // ── file_info ───────────────────────────────────────────────────────────────
  server.tool(
    "file_info",
    "Get metadata for a file without fetching its bytes.",
    FileInfoInput.shape,
    async (args) => {
      try {
        const { ref, blob } = await fetchFileInfo(core, { auth, referenceId: args.id });
        return ok(mapRef(ref, blob, publicBaseUrl));
      } catch (e) {
        return fail(e instanceof Error ? e.message : "file_info failed");
      }
    },
  );

  // ── revoke_file ─────────────────────────────────────────────────────────────
  server.tool(
    "revoke_file",
    "Revoke a file so it can no longer be downloaded via its short link.",
    RevokeFileInput.shape,
    async (args) => {
      try {
        const updated = await revokeFile(core, { auth, referenceId: args.id });
        return ok({
          id: updated.id,
          revoked_at: (updated.revokedAt ?? new Date()).toISOString(),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "revoke_file failed");
      }
    },
  );

  // ── delete_file ─────────────────────────────────────────────────────────────
  server.tool(
    "delete_file",
    "Soft-delete a file. The file is no longer accessible but storage bytes are retained briefly.",
    DeleteFileInput.shape,
    async (args) => {
      try {
        await deleteFile(core, { auth, referenceId: args.id });
        const row = await core.db.query.references.findFirst({
          where: (r, { eq }) => eq(r.id, args.id),
        });
        return ok({ id: args.id, deleted_at: (row?.deletedAt ?? new Date()).toISOString() });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "delete_file failed");
      }
    },
  );

  // ── extend_file_expiry ──────────────────────────────────────────────────────
  server.tool(
    "extend_file_expiry",
    "Extend the expiry date of a file to a new preset.",
    ExtendFileExpiryInput.shape,
    async (args) => {
      try {
        const updated = await extendFileExpiry(core, {
          auth,
          referenceId: args.id,
          expiresIn: args.expires_in,
        });
        return ok({ id: updated.id, expires_at: updated.expiresAt?.toISOString() ?? null });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "extend_file_expiry failed");
      }
    },
  );

  // ── list_files ──────────────────────────────────────────────────────────────
  server.tool(
    "list_files",
    "List files, optionally filtered by scope, run_id, consumer, or intent.",
    ListFilesInput.shape,
    async (args) => {
      try {
        const result = await listFiles(core, {
          auth,
          ...(args.scope !== undefined ? { scope: args.scope } : {}),
          ...(args.run_id !== undefined ? { runId: args.run_id } : {}),
          ...(args.consumer !== undefined ? { consumer: args.consumer } : {}),
          ...(args.intent !== undefined ? { intent: args.intent } : {}),
          ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        });

        const blobMap = new Map<string, BlobRow>();
        await Promise.all(
          result.files.map(async (ref) => {
            const blob = await core.db.query.blobs.findFirst({
              where: (b, { eq }) => eq(b.sha256, ref.blobSha256),
            });
            if (blob) blobMap.set(ref.blobSha256, blob);
          }),
        );

        const files = result.files
          .map((ref) => {
            const blob = blobMap.get(ref.blobSha256);
            return blob ? mapRef(ref, blob, publicBaseUrl) : null;
          })
          .filter((f): f is ReturnType<typeof mapRef> => f !== null);

        return ok({ files, cursor: result.nextCursor, total: result.total });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "list_files failed");
      }
    },
  );

  // ── list_run_artifacts ──────────────────────────────────────────────────────
  server.tool(
    "list_run_artifacts",
    "List all files associated with a run_id across any scope or step.",
    ListRunArtifactsInput.shape,
    async (args) => {
      try {
        const refs = await listRunArtifacts(core, { auth, runId: args.run_id });

        const blobMap = new Map<string, BlobRow>();
        await Promise.all(
          refs.map(async (ref) => {
            const blob = await core.db.query.blobs.findFirst({
              where: (b, { eq }) => eq(b.sha256, ref.blobSha256),
            });
            if (blob) blobMap.set(ref.blobSha256, blob);
          }),
        );

        const files = refs
          .map((ref) => {
            const blob = blobMap.get(ref.blobSha256);
            return blob ? mapRef(ref, blob, publicBaseUrl) : null;
          })
          .filter((f): f is ReturnType<typeof mapRef> => f !== null);

        return ok({ run_id: args.run_id, files, total: files.length });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "list_run_artifacts failed");
      }
    },
  );

  return server;
}

// ─── Public handler factory ───────────────────────────────────────────────────

export function createMcpHandler(
  core: CoreDeps,
): (auth: AuthContext, req: Request) => Promise<Response> {
  return async (auth, req) => {
    const server = buildServer(core, auth);
    // Stateless mode: omit sessionIdGenerator entirely so no session ID is issued
    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);
    return transport.handleRequest(req);
  };
}
