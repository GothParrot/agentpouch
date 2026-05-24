import { type AuthMiddlewareOptions, createAuthMiddleware } from "@agentbox/auth";
import { createMcpHandler } from "@agentbox/mcp";
import {
  createUploadRequestRoute,
  deleteFileRoute,
  eraseFileRoute,
  extendFileRoute,
  fileDownloadRoute,
  fileInfoRoute,
  getUploadRequestRoute,
  healthzRoute,
  ingestRoute,
  listFilesRoute,
  listRunArtifactsRoute,
  revokeFileRoute,
  shortLinkRoute,
  uploadPageRoute,
  uploadSubmitRoute,
} from "@agentbox/contracts";
import type { CoreDeps } from "@agentbox/core";
import type { Logger } from "@agentbox/observability";
import type { MetricsStore } from "@agentbox/observability";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  handleDeleteFile,
  handleEraseFile,
  handleExtendFile,
  handleFileDownload,
  handleFileInfo,
  handleListFiles,
  handleListRunArtifacts,
  handleRevokeFile,
  handleShortLink,
} from "./handlers/files.js";
import { handleIngest } from "./handlers/ingest.js";
import {
  handleCreateUploadRequest,
  handleGetUploadRequest,
  handleUploadPage,
  handleUploadSubmit,
} from "./handlers/upload-requests.js";
import { createHostMiddleware } from "./middleware/host.js";

export type AppOptions = {
  shortlinkDomain?: string;
  enableGuestMode: boolean;
  maxFileSizeBytes: number;
  allowedExpiryPresets: string[];
  defaultTtl: string;
  guestMaxFileSizeBytes: number;
  guestMaxTtl: string;
};

export type AppDeps = {
  core: CoreDeps;
  logger: Logger;
  metrics: MetricsStore;
  options: AppOptions;
};

export function createApp(deps: AppDeps): OpenAPIHono {
  const app = new OpenAPIHono();

  // ── Global middleware ────────────────────────────────────────────────────

  app.use("*", createHostMiddleware(deps.options.shortlinkDomain));

  // ── Auth middleware — all /v1/* except public shortlinks ─────────────────

  const guestAllowedPresets = deps.options.allowedExpiryPresets.filter((p) => {
    const order = ["10m", "1d", "3d", "7d", "30d"];
    return order.indexOf(p) <= order.indexOf(deps.options.guestMaxTtl);
  });

  const authOpts: AuthMiddlewareOptions = {
    db: deps.core.db,
    enableGuestMode: deps.options.enableGuestMode,
    defaults: {
      maxFileSizeBytes: deps.options.maxFileSizeBytes,
      allowedExpiryPresets: deps.options.allowedExpiryPresets,
      guestMaxFileSizeBytes: deps.options.guestMaxFileSizeBytes,
      guestMaxTtl: deps.options.guestMaxTtl,
      guestAllowedExpiryPresets: guestAllowedPresets,
    },
  };

  const authMiddleware = createAuthMiddleware(authOpts);

  app.use("/v1/*", async (c, next) => {
    // Shortlinks are public — no auth required
    if (/^\/v1\/f\/[^/]+$/.test(new URL(c.req.url).pathname)) return next();
    return authMiddleware(c, next);
  });

  // ── Request logger ───────────────────────────────────────────────────────

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    deps.logger.info("request", {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      duration_ms: Date.now() - start,
    });
  });

  // ── Ops routes ───────────────────────────────────────────────────────────

  app.openapi(healthzRoute, async (c) => {
    let dbOk = false;
    try {
      await deps.core.db.execute("SELECT 1" as never);
      dbOk = true;
    } catch {
      // db unreachable
    }

    if (!dbOk) {
      return c.json({ status: "degraded" as const, error: "database unreachable" }, 503);
    }
    return c.json(
      { status: "ok" as const, db: dbOk, storage: true, uptime_seconds: process.uptime() },
      200,
    );
  });

  app.get("/metrics", (c) =>
    c.text(deps.metrics.toPrometheus(), 200, { "Content-Type": "text/plain; version=0.0.4" }),
  );

  // ── OpenAPI doc ──────────────────────────────────────────────────────────

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: { title: "AgentBox API", version: "0.1.0" },
    servers: [{ url: deps.core.publicBaseUrl }],
  });

  // ── File routes ──────────────────────────────────────────────────────────

  const core = deps.core;

  app.openapi(ingestRoute, (c) => handleIngest(c, core) as never);
  app.openapi(fileInfoRoute, (c) => handleFileInfo(c, core) as never);
  app.openapi(fileDownloadRoute, (c) => handleFileDownload(c, core) as never);
  app.openapi(listFilesRoute, (c) => handleListFiles(c, core) as never);
  app.openapi(revokeFileRoute, (c) => handleRevokeFile(c, core) as never);
  app.openapi(deleteFileRoute, (c) => handleDeleteFile(c, core) as never);
  app.openapi(eraseFileRoute, (c) => handleEraseFile(c, core) as never);
  app.openapi(extendFileRoute, (c) => handleExtendFile(c, core) as never);
  app.openapi(shortLinkRoute, (c) => handleShortLink(c, core) as never);

  // ── Upload-request routes ────────────────────────────────────────────────

  app.openapi(createUploadRequestRoute, (c) => handleCreateUploadRequest(c, core) as never);
  app.openapi(getUploadRequestRoute, (c) => handleGetUploadRequest(c, core) as never);
  app.openapi(uploadPageRoute, (c) => handleUploadPage(c, core) as never);
  app.openapi(uploadSubmitRoute, (c) => handleUploadSubmit(c, core) as never);

  // ── Run manifest ─────────────────────────────────────────────────────────

  app.openapi(listRunArtifactsRoute, (c) => handleListRunArtifacts(c, core) as never);

  // ── MCP endpoint ─────────────────────────────────────────────────────────
  // Mounted at /v1/mcp; handles POST (tool calls), GET (SSE stream), DELETE (session).
  // Auth middleware already runs for all /v1/* before reaching here.

  const mcpHandler = createMcpHandler(core);

  app.all("/v1/mcp", async (c) => {
    const auth = c.get("auth");
    return mcpHandler(auth, c.req.raw);
  });

  return app;
}
