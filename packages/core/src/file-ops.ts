import { blobs, references } from "@agentbox/db";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import {
  FileExpiredError,
  FileNotFoundError,
  FileRevokedError,
  InvalidPresetError,
  MaxDownloadsExceededError,
  PermissionDeniedError,
} from "./errors.js";
import type { AuthContext, CoreDeps } from "./types.js";
import { expiresAtFromPreset } from "./utils.js";

// ─── FetchFileInfo ───────────────────────────────────────────────────────────

export type FetchFileInfoOptions = {
  auth: AuthContext;
  referenceId: string;
  recordAccess?: boolean;
  ip?: string;
  userAgent?: string;
};

export async function fetchFileInfo(deps: CoreDeps, opts: FetchFileInfoOptions) {
  const { db, events } = deps;

  const ref = await db.query.references.findFirst({
    where: eq(references.id, opts.referenceId),
  });

  if (!ref || ref.deletedAt) throw new FileNotFoundError(opts.referenceId);
  if (ref.revokedAt) throw new FileRevokedError();
  if (ref.expiresAt && ref.expiresAt < new Date()) throw new FileExpiredError();

  // Scope check: non-bootstrap can only see their own files
  if (opts.auth.kind !== "bootstrap") {
    const sameToken = ref.tokenId === opts.auth.tokenId;
    const sameTenant = ref.tenantId !== null && ref.tenantId === opts.auth.tenantId;
    if (!sameToken && !sameTenant) throw new PermissionDeniedError();
  }

  if (opts.recordAccess) {
    if (ref.maxDownloads !== null && ref.downloadCount >= ref.maxDownloads) {
      throw new MaxDownloadsExceededError();
    }
    await db
      .update(references)
      .set({ downloadCount: ref.downloadCount + 1 })
      .where(eq(references.id, ref.id));

    events.emit({
      type: "file.accessed",
      referenceId: ref.id,
      tenantId: ref.tenantId,
      ...(opts.ip !== undefined ? { ip: opts.ip } : {}),
      ...(opts.userAgent !== undefined ? { userAgent: opts.userAgent } : {}),
    });
  }

  const blob = await db.query.blobs.findFirst({ where: eq(blobs.sha256, ref.blobSha256) });
  if (!blob) throw new FileNotFoundError(ref.id);

  return { ref, blob };
}

// ─── FetchByShortId (human download page) ───────────────────────────────────

export async function fetchByShortId(
  deps: CoreDeps,
  opts: { shortid: string; recordAccess?: boolean; ip?: string; userAgent?: string },
) {
  const { db, kv, events } = deps;

  // KV cache lookup — cache value is the reference id
  const cachedId = kv.get<string>(opts.shortid);

  let ref = cachedId
    ? await db.query.references.findFirst({ where: eq(references.id, cachedId) })
    : undefined;

  if (!ref) {
    ref = await db.query.references.findFirst({
      where: eq(references.shortid, opts.shortid),
    });
    if (ref) kv.set(opts.shortid, ref.id, 5 * 60 * 1000); // 5 min TTL
  }

  if (!ref || ref.deletedAt) throw new FileNotFoundError(opts.shortid);
  if (ref.revokedAt) throw new FileRevokedError();
  if (ref.expiresAt && ref.expiresAt < new Date()) throw new FileExpiredError();

  if (opts.recordAccess) {
    if (ref.maxDownloads !== null && ref.downloadCount >= ref.maxDownloads) {
      throw new MaxDownloadsExceededError();
    }
    await db
      .update(references)
      .set({ downloadCount: ref.downloadCount + 1 })
      .where(eq(references.id, ref.id));

    events.emit({
      type: "file.accessed",
      referenceId: ref.id,
      tenantId: ref.tenantId,
      ...(opts.ip !== undefined ? { ip: opts.ip } : {}),
      ...(opts.userAgent !== undefined ? { userAgent: opts.userAgent } : {}),
    });
  }

  const blob = await db.query.blobs.findFirst({ where: eq(blobs.sha256, ref.blobSha256) });
  if (!blob) throw new FileNotFoundError(opts.shortid);

  return { ref, blob };
}

// ─── RevokeFile ──────────────────────────────────────────────────────────────

export async function revokeFile(deps: CoreDeps, opts: { auth: AuthContext; referenceId: string }) {
  const { db, kv, events } = deps;

  const ref = await db.query.references.findFirst({
    where: and(eq(references.id, opts.referenceId), isNull(references.deletedAt)),
  });

  if (!ref) throw new FileNotFoundError(opts.referenceId);
  if (ref.revokedAt) return ref; // idempotent

  if (opts.auth.kind !== "bootstrap" && ref.tokenId !== opts.auth.tokenId) {
    throw new PermissionDeniedError();
  }

  const [updated] = await db
    .update(references)
    .set({ revokedAt: new Date() })
    .where(eq(references.id, ref.id))
    .returning();

  kv.delete(ref.shortid);
  events.emit({ type: "file.revoked", referenceId: ref.id, tenantId: ref.tenantId });

  if (!updated) throw new Error("Revoke failed — row not returned");
  return updated;
}

// ─── DeleteFile ──────────────────────────────────────────────────────────────

export async function deleteFile(
  deps: CoreDeps,
  opts: { auth: AuthContext; referenceId: string; hard?: boolean },
) {
  const { db, kv, storage, events } = deps;

  const ref = await db.query.references.findFirst({
    where: eq(references.id, opts.referenceId),
  });

  if (!ref) throw new FileNotFoundError(opts.referenceId);

  if (opts.auth.kind !== "bootstrap" && ref.tokenId !== opts.auth.tokenId) {
    throw new PermissionDeniedError();
  }

  if (opts.hard) {
    if (!opts.auth.policy.canHardDelete) {
      throw new PermissionDeniedError("Hard delete requires elevated privileges");
    }

    await db.delete(references).where(eq(references.id, ref.id));

    const blob = await db.query.blobs.findFirst({ where: eq(blobs.sha256, ref.blobSha256) });
    if (blob) {
      const newCount = blob.refCount - 1;
      if (newCount <= 0) {
        await storage.delete(blob.storageKey);
        await db.delete(blobs).where(eq(blobs.sha256, blob.sha256));
      } else {
        await db.update(blobs).set({ refCount: newCount }).where(eq(blobs.sha256, blob.sha256));
      }
    }
  } else {
    if (ref.deletedAt) return; // soft-deleted already, idempotent
    await db.update(references).set({ deletedAt: new Date() }).where(eq(references.id, ref.id));
  }

  kv.delete(ref.shortid);
  events.emit({ type: "file.deleted", referenceId: ref.id, tenantId: ref.tenantId });
}

// ─── ExtendExpiry ─────────────────────────────────────────────────────────────

export async function extendFileExpiry(
  deps: CoreDeps,
  opts: { auth: AuthContext; referenceId: string; expiresIn: string },
) {
  const { db, kv, allowedExpiryPresets } = deps;

  if (!allowedExpiryPresets.includes(opts.expiresIn)) {
    throw new InvalidPresetError(opts.expiresIn, allowedExpiryPresets);
  }
  if (!opts.auth.policy.allowedExpiryPresets.includes(opts.expiresIn)) {
    throw new InvalidPresetError(opts.expiresIn, opts.auth.policy.allowedExpiryPresets);
  }

  const ref = await db.query.references.findFirst({
    where: and(eq(references.id, opts.referenceId), isNull(references.deletedAt)),
  });

  if (!ref) throw new FileNotFoundError(opts.referenceId);
  if (opts.auth.kind !== "bootstrap" && ref.tokenId !== opts.auth.tokenId) {
    throw new PermissionDeniedError();
  }

  const [updated] = await db
    .update(references)
    .set({ expiresAt: expiresAtFromPreset(opts.expiresIn) })
    .where(eq(references.id, ref.id))
    .returning();

  kv.delete(ref.shortid);
  if (!updated) throw new Error("Extend failed — row not returned");
  return updated;
}

// ─── ListFiles ───────────────────────────────────────────────────────────────

export type ListFilesInput = {
  auth: AuthContext;
  scope?: string;
  runId?: string;
  consumer?: string;
  intent?: string;
  cursor?: string; // ISO timestamp of last seen createdAt
  limit?: number;
};

export async function listFiles(deps: CoreDeps, input: ListFilesInput) {
  const { db } = deps;
  const limit = Math.min(input.limit ?? 20, 100);

  const filters = [isNull(references.deletedAt), isNull(references.revokedAt)];

  if (input.auth.tenantId) {
    filters.push(eq(references.tenantId, input.auth.tenantId));
  } else {
    filters.push(eq(references.tokenId, input.auth.tokenId));
  }

  if (input.scope) filters.push(eq(references.scope, input.scope));
  if (input.runId) filters.push(eq(references.runId, input.runId));
  if (input.consumer) filters.push(eq(references.consumer, input.consumer));
  if (input.intent) filters.push(eq(references.intent, input.intent));
  if (input.cursor) filters.push(lt(references.createdAt, new Date(input.cursor)));

  const rows = await db.query.references.findMany({
    where: and(...filters),
    orderBy: [desc(references.createdAt)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const files = rows.slice(0, limit);
  const nextCursor = hasMore ? files[files.length - 1]?.createdAt.toISOString() : undefined;

  return { files, nextCursor, total: files.length };
}

// ─── ListRunArtifacts ────────────────────────────────────────────────────────

export async function listRunArtifacts(deps: CoreDeps, opts: { auth: AuthContext; runId: string }) {
  const { db } = deps;

  const filters = [
    eq(references.runId, opts.runId),
    isNull(references.deletedAt),
    isNull(references.revokedAt),
  ];

  if (opts.auth.tenantId) {
    filters.push(eq(references.tenantId, opts.auth.tenantId));
  } else {
    filters.push(eq(references.tokenId, opts.auth.tokenId));
  }

  return db.query.references.findMany({
    where: and(...filters),
    orderBy: [desc(references.createdAt)],
  });
}
