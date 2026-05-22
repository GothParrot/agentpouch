import { completeUploadRequest, createUploadRequest } from "@agentbox/core";
import type { CoreDeps } from "@agentbox/core";
import { blobs, references, uploadRequests } from "@agentbox/db";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { handleError, toApiReference } from "./utils.js";

// ─── POST /v1/upload-requests ────────────────────────────────────────────────

export async function handleCreateUploadRequest(c: Context, core: CoreDeps) {
  try {
    const auth = c.get("auth");
    const body = await c.req.json<{
      expires_in?: string;
      filename_hint?: string;
      scope?: string;
      run_id?: string;
      step?: string;
      producer?: string;
      consumer?: string;
      intent?: string;
      allowed_mime_types?: string[];
      max_file_size_bytes?: number;
    }>();

    const req = await createUploadRequest(core, {
      auth,
      ...(body.expires_in ? { expiresIn: body.expires_in } : {}),
      ...(body.filename_hint ? { filenameHint: body.filename_hint } : {}),
      ...(body.scope ? { scope: body.scope } : {}),
      ...(body.run_id ? { runId: body.run_id } : {}),
      ...(body.step ? { step: body.step } : {}),
      ...(body.producer ? { producer: body.producer } : {}),
      ...(body.consumer ? { consumer: body.consumer } : {}),
      ...(body.intent ? { intent: body.intent } : {}),
      ...(body.allowed_mime_types ? { allowedMimeTypes: body.allowed_mime_types } : {}),
      ...(body.max_file_size_bytes !== undefined
        ? { maxFileSizeBytes: body.max_file_size_bytes }
        : {}),
    });

    return c.json({
      id: req.id,
      shortid: req.shortid,
      status: req.status,
      upload_link: `${core.publicBaseUrl}/u/${req.shortid}`,
      expires_at: req.expiresAt.toISOString(),
    });
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── GET /v1/upload-requests/:id ─────────────────────────────────────────────

export async function handleGetUploadRequest(c: Context, core: CoreDeps) {
  try {
    const { id } = c.req.param() as { id: string };
    const req = await core.db.query.uploadRequests.findFirst({
      where: eq(uploadRequests.id, id),
    });

    if (!req) return c.json({ error: "Upload request not found" }, 404 as never);

    let file = null;
    if (req.fulfilledReferenceId) {
      const ref = await core.db.query.references.findFirst({
        where: eq(references.id, req.fulfilledReferenceId),
      });
      if (ref) {
        const blob = await core.db.query.blobs.findFirst({
          where: eq(blobs.sha256, ref.blobSha256),
        });
        if (blob) file = toApiReference(ref, blob, core.publicBaseUrl);
      }
    }

    return c.json({
      id: req.id,
      shortid: req.shortid,
      status: req.status,
      upload_link: `${core.publicBaseUrl}/u/${req.shortid}`,
      expires_at: req.expiresAt.toISOString(),
      fulfilled_reference_id: req.fulfilledReferenceId,
      file,
    });
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── GET /u/:shortid — Browser upload page ───────────────────────────────────

export async function handleUploadPage(c: Context, core: CoreDeps) {
  try {
    const { shortid } = c.req.param() as { shortid: string };
    const req = await core.db.query.uploadRequests.findFirst({
      where: eq(uploadRequests.shortid, shortid),
    });

    if (!req) return c.html("<h1>Not found</h1>", 404);
    if (req.status !== "pending" || req.expiresAt < new Date()) {
      return c.html("<h1>This upload link has expired or already been used.</h1>", 410);
    }

    const accept = req.allowedMimeTypes ? (req.allowedMimeTypes as string[]).join(",") : "*/*";
    const maxSize = req.maxFileSizeBytes ? Number(req.maxFileSizeBytes) : null;
    const hint = req.filenameHint ?? "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Upload a file — AgentBox</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 1rem;color:#1a1a1a}
    h1{font-size:1.25rem}p{color:#555;font-size:.9rem}
    label{display:block;margin:1rem 0 .25rem;font-weight:600}
    input[type=file]{display:block;width:100%}
    button{margin-top:1.5rem;padding:.6rem 1.4rem;background:#0070f3;color:#fff;border:none;border-radius:6px;font-size:1rem;font-weight:600;cursor:pointer}
    button:hover{background:#005cc5}#status{margin-top:1rem;font-size:.9rem;color:#555}
  </style>
</head>
<body>
  <h1>Upload a file</h1>
  ${hint ? `<p>Expected: <strong>${escHtml(hint)}</strong></p>` : ""}
  ${maxSize ? `<p>Maximum size: ${formatBytes(maxSize)}</p>` : ""}
  <form id="f" enctype="multipart/form-data">
    <label>Select file${accept !== "*/*" ? ` (${escHtml(accept)})` : ""}
      <input type="file" name="file" accept="${escHtml(accept)}" required>
    </label>
    <button type="submit">Upload</button>
  </form>
  <p id="status"></p>
  <script>
    document.getElementById('f').addEventListener('submit',async e=>{
      e.preventDefault();
      const s=document.getElementById('status');
      s.textContent='Uploading…';
      try{
        const r=await fetch('/u/${shortid}',{method:'POST',body:new FormData(e.target)});
        if(r.ok){s.textContent='Upload complete! The agent has been notified.';e.target.querySelector('button').disabled=true;}
        else{const d=await r.json();s.textContent='Error: '+d.error;}
      }catch{s.textContent='Network error. Please try again.';}
    });
  </script>
</body>
</html>`;

    return c.html(html);
  } catch (err) {
    return handleError(c, err);
  }
}

// ─── POST /u/:shortid — Browser form submission ───────────────────────────────

export async function handleUploadSubmit(c: Context, core: CoreDeps) {
  try {
    const { shortid } = c.req.param() as { shortid: string };
    const form = await c.req.parseBody();
    const file = form["file"];

    if (!file || !(file instanceof Blob)) {
      return c.json({ error: "file field is required" }, 400 as never);
    }

    const { ref, blob } = await completeUploadRequest(core, {
      shortid,
      filename: file instanceof File ? file.name : "upload",
      mimeType: file.type || "application/octet-stream",
      body: file.stream() as ReadableStream<Uint8Array>,
    });

    return c.json({ ok: true, reference: toApiReference(ref, blob, core.publicBaseUrl) });
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
