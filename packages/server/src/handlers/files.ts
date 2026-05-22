import {
  deleteFile,
  extendFileExpiry,
  fetchByShortId,
  fetchFileInfo,
  listFiles,
  listRunArtifacts,
  revokeFile,
} from "@agentbox/core";
import type { CoreDeps } from "@agentbox/core";
import type { Context } from "hono";
import { handleError, toApiReference } from "./utils.js";

// ─── GET /v1/files/:id ───────────────────────────────────────────────────────

export async function handleFileInfo(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const { id } = c.req.param() as { id: string };
    const { ref, blob } = await fetchFileInfo(core, { auth, referenceId: id });
    return c.json(toApiReference(ref, blob, core.publicBaseUrl));
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── GET /v1/files/:id/download ──────────────────────────────────────────────

export async function handleFileDownload(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const { id } = c.req.param() as { id: string };
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip");
    const userAgent = c.req.header("user-agent");
    const { ref, blob } = await fetchFileInfo(core, {
      auth,
      referenceId: id,
      recordAccess: true,
      ...(ip !== undefined ? { ip } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
    });

    const strategy = core.storage.getServeStrategy(blob.storageKey);
    if (strategy.type === "redirect") return c.redirect(strategy.url, 302);

    const stream = await core.storage.get(blob.storageKey);
    return c.body(stream as ReadableStream, 200, {
      "Content-Type": blob.mimeType,
      "Content-Disposition": `attachment; filename="${ref.filename}"`,
      "Content-Length": blob.sizeBytes,
    });
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── GET /v1/files ───────────────────────────────────────────────────────────

export async function handleListFiles(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const query = c.req.query() as {
      scope?: string;
      run_id?: string;
      consumer?: string;
      intent?: string;
      limit?: string;
      cursor?: string;
    };

    const result = await listFiles(core, {
      auth,
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.run_id ? { runId: query.run_id } : {}),
      ...(query.consumer ? { consumer: query.consumer } : {}),
      ...(query.intent ? { intent: query.intent } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit ? Number(query.limit) : 50,
    });

    const blobMap = new Map<string, { sha256: string; sizeBytes: string; mimeType: string }>();
    await Promise.all(
      result.files.map(async (ref) => {
        const blob = await core.db.query.blobs.findFirst({
          where: (b, { eq }) => eq(b.sha256, ref.blobSha256),
        });
        if (blob) blobMap.set(ref.blobSha256, blob);
      }),
    );

    return c.json({
      files: result.files
        .map((ref) => {
          const blob = blobMap.get(ref.blobSha256);
          return blob ? toApiReference(ref, blob, core.publicBaseUrl) : null;
        })
        .filter(Boolean),
      cursor: result.nextCursor,
      total: result.total,
    });
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── POST /v1/files/:id/revoke ───────────────────────────────────────────────

export async function handleRevokeFile(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const { id } = c.req.param() as { id: string };
    const updated = await revokeFile(core, { auth, referenceId: id });
    return c.json({ id: updated.id, revoked_at: (updated.revokedAt ?? new Date()).toISOString() });
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── DELETE /v1/files/:id ────────────────────────────────────────────────────

export async function handleDeleteFile(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const { id } = c.req.param() as { id: string };
    await deleteFile(core, { auth, referenceId: id });
    return c.body(null, 204);
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── POST /v1/files/:id/erase ────────────────────────────────────────────────

export async function handleEraseFile(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const { id } = c.req.param() as { id: string };
    await deleteFile(core, { auth, referenceId: id, hard: true });
    return c.body(null, 204);
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── POST /v1/files/:id/extend ───────────────────────────────────────────────

export async function handleExtendFile(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const { id } = c.req.param() as { id: string };
    const body = await c.req.json<{ expires_in: string }>();
    const updated = await extendFileExpiry(core, {
      auth,
      referenceId: id,
      expiresIn: body.expires_in,
    });
    return c.json({ id: updated.id, expires_at: updated.expiresAt?.toISOString() ?? null });
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── GET /v1/f/:shortid — Human short-link ──────────────────────────────────

export async function handleShortLink(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const { shortid } = c.req.param() as { shortid: string };
    const accept = c.req.header("accept") ?? "";
    const isAgent = accept.includes("application/octet-stream") || !accept.includes("text/html");
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip");
    const userAgent = c.req.header("user-agent");

    const { ref, blob } = await fetchByShortId(core, {
      shortid,
      ...(isAgent ? { recordAccess: true } : {}),
      ...(ip !== undefined ? { ip } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
    });

    if (isAgent) {
      const strategy = core.storage.getServeStrategy(blob.storageKey);
      if (strategy.type === "redirect") return c.redirect(strategy.url, 302);
      const stream = await core.storage.get(blob.storageKey);
      return c.body(stream as ReadableStream, 200, {
        "Content-Type": blob.mimeType,
        "Content-Disposition": `attachment; filename="${ref.filename}"`,
        "Content-Length": blob.sizeBytes,
      });
    }

    // Browser: render download page
    const expiresInfo = ref.expiresAt ? `Expires: ${ref.expiresAt.toUTCString()}` : "No expiry";
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(ref.filename)} — AgentBox</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 1rem;color:#1a1a1a}
    h1{font-size:1.25rem;word-break:break-all}p{color:#555;font-size:.9rem;margin:.25rem 0}
    a.btn{display:inline-block;margin-top:1.5rem;padding:.6rem 1.4rem;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}
    a.btn:hover{background:#005cc5}
  </style>
</head>
<body>
  <h1>${escHtml(ref.filename)}</h1>
  <p>${formatBytes(Number(blob.sizeBytes))} &middot; ${escHtml(blob.mimeType)}</p>
  <p>${escHtml(expiresInfo)}</p>
  <a class="btn" href="${core.publicBaseUrl}/v1/f/${shortid}" download="${escHtml(ref.filename)}">Download</a>
</body>
</html>`;

    return c.html(html);
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── GET /v1/runs/:run_id ─────────────────────────────────────────────────────

export async function handleListRunArtifacts(c: Context, core: CoreDeps): Promise<Response> {
  try {
    const auth = c.get("auth");
    const { run_id } = c.req.param() as { run_id: string };
    const refs = await listRunArtifacts(core, { auth, runId: run_id });

    const blobMap = new Map<string, { sha256: string; sizeBytes: string; mimeType: string }>();
    await Promise.all(
      refs.map(async (ref) => {
        const blob = await core.db.query.blobs.findFirst({
          where: (b, { eq }) => eq(b.sha256, ref.blobSha256),
        });
        if (blob) blobMap.set(ref.blobSha256, blob);
      }),
    );

    return c.json({
      run_id,
      files: refs
        .map((ref) => {
          const blob = blobMap.get(ref.blobSha256);
          return blob ? toApiReference(ref, blob, core.publicBaseUrl) : null;
        })
        .filter(Boolean),
    });
  } catch (err) {
    return handleError(c, err);
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
