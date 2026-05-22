import { type Db, accessEvents, webhooks } from "@agentbox/db";
import { and, eq } from "drizzle-orm";

export type EventType =
  | "file.created"
  | "file.accessed"
  | "file.revoked"
  | "file.deleted"
  | "file.expired";

export type AgentBoxEvent = {
  type: EventType;
  referenceId: string;
  tenantId: string | null;
  accountId?: string | null;
  ip?: string;
  userAgent?: string;
};

export interface EventSink {
  emit(event: AgentBoxEvent): void;
}

export class NoopEventSink implements EventSink {
  emit(_event: AgentBoxEvent): void {}
}

type DbEventType = "created" | "accessed" | "revoked" | "deleted" | "expired";

function toDbType(t: EventType): DbEventType {
  return t.slice("file.".length) as DbEventType;
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function dispatchWebhook(url: string, secret: string, event: AgentBoxEvent): Promise<void> {
  const payload = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  const sig = await hmacSign(secret, payload);
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AgentBox-Signature": `sha256=${sig}`,
    },
    body: payload,
    signal: AbortSignal.timeout(5000),
  });
}

export class PostgresEventSink implements EventSink {
  constructor(private readonly db: Db) {}

  emit(event: AgentBoxEvent): void {
    // Fire-and-forget: event recording must never block the serve path
    void this.db
      .insert(accessEvents)
      .values({
        referenceId: event.referenceId,
        eventType: toDbType(event.type),
        tenantId: event.tenantId ?? undefined,
        ip: event.ip,
        userAgent: event.userAgent,
      })
      .catch(() => {});

    if (event.tenantId) {
      void this.dispatchWebhooks(event);
    }
  }

  private async dispatchWebhooks(event: AgentBoxEvent): Promise<void> {
    const { tenantId } = event;
    if (!tenantId) return;
    try {
      const rows = await this.db.query.webhooks.findMany({
        where: and(eq(webhooks.tenantId, tenantId), eq(webhooks.enabled, true)),
      });
      await Promise.allSettled(
        rows
          .filter((w) => (w.events as string[]).includes(event.type))
          .map((w) => dispatchWebhook(w.url, w.secret, event)),
      );
    } catch {
      // webhook errors must never propagate
    }
  }
}
