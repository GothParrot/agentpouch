import { ingestFile } from "@agentpouch/core";
import type { CoreDeps } from "@agentpouch/core";
import type { Context } from "hono";
import { handleError, toApiReference } from "./utils.js";

export async function handleIngest(c: Context, core: CoreDeps) {
  try {
    const auth = c.get("auth");
    const idempotencyKey = c.req.header("idempotency-key");
    const ct = c.req.header("content-type") ?? "";

    let result: Awaited<ReturnType<typeof ingestFile>>;

    if (
      ct.startsWith("multipart/form-data") ||
      ct.startsWith("application/x-www-form-urlencoded")
    ) {
      const form = await c.req.parseBody();
      const file = form["file"];

      if (!file || !(file instanceof Blob)) {
        return c.json({ error: "file field is required" }, 400 as never);
      }

      result = await ingestFile(core, {
        auth,
        filename: file instanceof File ? file.name : String(form["filename"] ?? "upload"),
        mimeType: file.type || "application/octet-stream",
        body: file.stream() as ReadableStream<Uint8Array>,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(form["expires_in"] ? { expiresIn: String(form["expires_in"]) } : {}),
        ...(form["scope"] ? { scope: String(form["scope"]) } : {}),
        ...(form["run_id"] ? { runId: String(form["run_id"]) } : {}),
        ...(form["step"] ? { step: String(form["step"]) } : {}),
        ...(form["producer"] ? { producer: String(form["producer"]) } : {}),
        ...(form["consumer"] ? { consumer: String(form["consumer"]) } : {}),
        ...(form["intent"] ? { intent: String(form["intent"]) } : {}),
      });
    } else {
      // application/json — URL fetch
      const json = await c.req.json<{
        url: string;
        expires_in?: string;
        scope?: string;
        run_id?: string;
      }>();
      const resp = await fetch(json.url);
      if (!resp.ok || !resp.body) {
        return c.json({ error: `Failed to fetch URL: ${resp.status}` }, 400 as never);
      }
      const urlPath = new URL(json.url).pathname;
      const filename = urlPath.split("/").filter(Boolean).pop() ?? "download";
      result = await ingestFile(core, {
        auth,
        filename,
        mimeType: resp.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
        body: resp.body as ReadableStream<Uint8Array>,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(json.expires_in ? { expiresIn: json.expires_in } : {}),
        ...(json.scope ? { scope: json.scope } : {}),
        ...(json.run_id ? { runId: json.run_id } : {}),
      });
    }

    return c.json(toApiReference(result.ref, result.blob, core.publicBaseUrl), 200);
  } catch (err) {
    return handleError(c, err);
  }
}
