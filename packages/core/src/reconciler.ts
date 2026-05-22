import { blobs, references, uploadRequests } from "@agentbox/db";
import { and, eq, isNull, lt, lte } from "drizzle-orm";
import type { CoreDeps } from "./types.js";

/**
 * Runs periodic cleanup tasks:
 * - Marks pending upload requests as expired
 * - Marks references as deleted when their expiry passes
 * - Purges orphaned blobs (ref_count = 0) from storage
 */
export function startReconciler(deps: CoreDeps, intervalMs = 60_000): () => void {
  async function reconcile(): Promise<void> {
    const now = new Date();
    try {
      // 1. Expire pending upload requests
      await deps.db
        .update(uploadRequests)
        .set({ status: "expired" })
        .where(and(eq(uploadRequests.status, "pending"), lte(uploadRequests.expiresAt, now)));

      // 2. Soft-delete expired references (those whose expiresAt has passed)
      const expired = await deps.db.query.references.findMany({
        where: and(isNull(references.deletedAt), lt(references.expiresAt, now)),
      });

      for (const ref of expired) {
        await deps.db.update(references).set({ deletedAt: now }).where(eq(references.id, ref.id));

        deps.kv.delete(ref.shortid);
        deps.events.emit({ type: "file.expired", referenceId: ref.id, tenantId: ref.tenantId });
      }

      // 3. Purge orphaned blobs (ref_count = 0)
      const orphans = await deps.db.query.blobs.findMany({
        where: eq(blobs.refCount, 0),
      });

      for (const blob of orphans) {
        try {
          await deps.storage.delete(blob.storageKey);
          await deps.db.delete(blobs).where(eq(blobs.sha256, blob.sha256));
        } catch {
          deps.logger.warn("reconciler: failed to purge orphan blob", { key: blob.storageKey });
        }
      }
    } catch (err) {
      deps.logger.error("reconciler error", { error: String(err) });
    }
  }

  const handle = setInterval(() => void reconcile(), intervalMs);
  return () => clearInterval(handle);
}
