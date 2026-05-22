import type { Policy } from "@agentbox/auth";
import { uploadRequests } from "@agentbox/db";
import { eq } from "drizzle-orm";
import {
  InvalidPresetError,
  UploadRequestAlreadyCompletedError,
  UploadRequestExpiredError,
  UploadRequestNotFoundError,
} from "./errors.js";
import { ingestFile } from "./ingest.js";
import type { AuthContext, CoreDeps } from "./types.js";
import { expiresAtFromPreset, generateShortId } from "./utils.js";

export type CreateUploadRequestInput = {
  auth: AuthContext;
  expiresIn?: string;
  filenameHint?: string;
  scope?: string;
  runId?: string;
  step?: string;
  producer?: string;
  consumer?: string;
  intent?: string;
  allowedMimeTypes?: string[];
  maxFileSizeBytes?: number;
};

export async function createUploadRequest(deps: CoreDeps, input: CreateUploadRequestInput) {
  const { db, allowedExpiryPresets, defaultTtl } = deps;

  const expiresIn = input.expiresIn ?? defaultTtl;
  if (!allowedExpiryPresets.includes(expiresIn)) {
    throw new InvalidPresetError(expiresIn, allowedExpiryPresets);
  }

  const [req] = await db
    .insert(uploadRequests)
    .values({
      tenantId: input.auth.tenantId ?? undefined,
      accountId: input.auth.accountId ?? undefined,
      tokenId: input.auth.tokenId,
      shortid: generateShortId(),
      filenameHint: input.filenameHint,
      scope: input.scope,
      runId: input.runId,
      step: input.step,
      producer: input.producer,
      consumer: input.consumer,
      intent: input.intent,
      expiresAt: expiresAtFromPreset(expiresIn),
      allowedMimeTypes: input.allowedMimeTypes,
      maxFileSizeBytes:
        input.maxFileSizeBytes !== undefined ? String(input.maxFileSizeBytes) : undefined,
      maxUploads: 1,
    })
    .returning();

  if (!req) throw new Error("Failed to create upload request");
  return req;
}

export type CompleteUploadRequestInput = {
  shortid: string;
  filename: string;
  mimeType: string;
  body: ReadableStream<Uint8Array>;
};

export async function completeUploadRequest(deps: CoreDeps, input: CompleteUploadRequestInput) {
  const { db } = deps;

  const req = await db.query.uploadRequests.findFirst({
    where: eq(uploadRequests.shortid, input.shortid),
  });

  if (!req) throw new UploadRequestNotFoundError();
  if (req.status === "completed") throw new UploadRequestAlreadyCompletedError();
  if (req.status === "expired" || req.expiresAt < new Date()) throw new UploadRequestExpiredError();

  // Build a synthetic auth context from the upload request's constraints
  const policy: Policy = {
    maxFileSizeBytes: req.maxFileSizeBytes
      ? Math.min(Number(req.maxFileSizeBytes), deps.defaultMaxFileSizeBytes)
      : deps.defaultMaxFileSizeBytes,
    allowedMimeTypes: (req.allowedMimeTypes as string[] | null) ?? null,
    storageQuotaBytes: null,
    rateLimitRpm: null,
    allowedExpiryPresets: deps.allowedExpiryPresets,
    canHardDelete: false,
    isGuest: true,
  };

  const syntheticAuth: AuthContext = {
    kind: "guest_session",
    tokenId: req.tokenId ?? "system",
    tenantId: req.tenantId ?? null,
    accountId: req.accountId ?? null,
    policy,
  };

  const { ref, blob } = await ingestFile(deps, {
    auth: syntheticAuth,
    filename: input.filename,
    mimeType: input.mimeType,
    body: input.body,
    ...(req.scope !== null ? { scope: req.scope } : {}),
    ...(req.runId !== null ? { runId: req.runId } : {}),
    ...(req.step !== null ? { step: req.step } : {}),
    ...(req.producer !== null ? { producer: req.producer } : {}),
    ...(req.consumer !== null ? { consumer: req.consumer } : {}),
    ...(req.intent !== null ? { intent: req.intent } : {}),
  });

  await db
    .update(uploadRequests)
    .set({ status: "completed", fulfilledReferenceId: ref.id, uploadCount: req.uploadCount + 1 })
    .where(eq(uploadRequests.id, req.id));

  return { ref, blob, req };
}
