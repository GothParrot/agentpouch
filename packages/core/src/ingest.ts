import { blobs, references } from "@agentpouch/db";
import { and, eq, isNull } from "drizzle-orm";
import {
  FileTooLargeError,
  InvalidPresetError,
  MimeTypeNotAllowedError,
  PermissionDeniedError,
} from "./errors.js";
import type { AuthContext, CoreDeps } from "./types.js";
import { bytesToStream, collectStream, expiresAtFromPreset, generateShortId } from "./utils.js";

export type IngestInput = {
  auth: AuthContext;
  filename: string;
  mimeType: string;
  body: ReadableStream<Uint8Array>;
  idempotencyKey?: string;
  expiresIn?: string;
  scope?: string;
  runId?: string;
  step?: string;
  producer?: string;
  consumer?: string;
  intent?: string;
};

export async function ingestFile(deps: CoreDeps, input: IngestInput) {
  const { db, storage, storageBackend, events, scanner, allowedExpiryPresets, defaultTtl } = deps;
  const { auth, filename, mimeType, body, idempotencyKey } = input;

  // MIME policy
  if (auth.policy.allowedMimeTypes !== null && !auth.policy.allowedMimeTypes.includes(mimeType)) {
    throw new MimeTypeNotAllowedError(mimeType);
  }

  // Idempotency: if this exact key was already ingested by this token, return existing
  if (idempotencyKey && auth.tokenId) {
    const existing = await db.query.references.findFirst({
      where: and(
        eq(references.tokenId, auth.tokenId),
        eq(references.idempotencyKey, idempotencyKey),
        isNull(references.deletedAt),
      ),
    });
    if (existing) {
      const existingBlob = await db.query.blobs.findFirst({
        where: eq(blobs.sha256, existing.blobSha256),
      });
      if (!existingBlob) throw new Error("Blob not found for idempotent reference");
      return { ref: existing, blob: existingBlob };
    }
  }

  // Validate TTL preset
  const expiresIn = input.expiresIn ?? defaultTtl;
  if (!allowedExpiryPresets.includes(expiresIn)) {
    throw new InvalidPresetError(expiresIn, allowedExpiryPresets);
  }
  if (!auth.policy.allowedExpiryPresets.includes(expiresIn)) {
    throw new InvalidPresetError(expiresIn, auth.policy.allowedExpiryPresets);
  }

  // Buffer stream + sha256 (required for content-addressed storage and dedup)
  const { sha256, size, data } = await collectStream(body);

  // Size policy check
  if (size > auth.policy.maxFileSizeBytes) {
    throw new FileTooLargeError(size, auth.policy.maxFileSizeBytes);
  }

  // Scan (NoopScanner always passes; real scanners return clean:false for malware)
  const scanResult = await scanner.scan(bytesToStream(data));
  if (!scanResult.clean) {
    throw new PermissionDeniedError(`File failed security scan: ${scanResult.reason}`);
  }

  // Blob dedup: same sha256 → reuse blob row, only bump ref_count
  const existingBlob = await db.query.blobs.findFirst({ where: eq(blobs.sha256, sha256) });
  let blob: {
    sha256: string;
    sizeBytes: string;
    mimeType: string;
    storageBackend: string;
    storageKey: string;
    refCount: number;
    encryptionContext: unknown;
    createdAt: Date;
  };

  if (!existingBlob) {
    await storage.put(sha256, bytesToStream(data), { contentType: mimeType, size });
    const [inserted] = await db
      .insert(blobs)
      .values({
        sha256,
        sizeBytes: String(size),
        mimeType,
        storageBackend,
        storageKey: sha256,
        refCount: 1,
      })
      .returning();
    if (!inserted) throw new Error("Failed to insert blob");
    blob = inserted;
  } else {
    await db
      .update(blobs)
      .set({ refCount: existingBlob.refCount + 1 })
      .where(eq(blobs.sha256, sha256));
    blob = existingBlob;
  }

  const expiresAt = expiresAtFromPreset(expiresIn);
  const shortid = generateShortId();

  const [ref] = await db
    .insert(references)
    .values({
      tenantId: auth.tenantId ?? undefined,
      accountId: auth.accountId ?? undefined,
      tokenId: auth.tokenId,
      blobSha256: sha256,
      shortid,
      filename,
      direction: "ingest",
      scope: input.scope,
      runId: input.runId,
      step: input.step,
      producer: input.producer,
      consumer: input.consumer,
      intent: input.intent,
      idempotencyKey,
      expiresAt,
    })
    .returning();

  if (!ref) throw new Error("Failed to create reference");

  events.emit({
    type: "file.created",
    referenceId: ref.id,
    tenantId: auth.tenantId,
    accountId: auth.accountId,
  });

  return { ref, blob };
}
