import { AgentBoxError } from "@agentbox/core";
import type { Context } from "hono";

export type ReferenceRow = {
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

export type BlobRow = {
  sha256: string;
  sizeBytes: string;
  mimeType: string;
};

export function toApiReference(ref: ReferenceRow, blob: BlobRow, publicBaseUrl: string) {
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

export function handleError(c: Context, err: unknown) {
  if (err instanceof AgentBoxError) {
    return c.json({ error: err.message, code: err.code }, err.statusHint as 400);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500 as never);
}
