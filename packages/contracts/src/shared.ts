import { z } from "@hono/zod-openapi";

export const ExpiryPreset = z.enum(["10m", "1d", "3d", "7d", "30d"]);
export type ExpiryPreset = z.infer<typeof ExpiryPreset>;

export const Direction = z.enum(["ingest", "serve"]);
export type Direction = z.infer<typeof Direction>;

export const UploadRequestStatus = z.enum(["pending", "completed", "expired"]);
export type UploadRequestStatus = z.infer<typeof UploadRequestStatus>;

export const TokenKind = z.enum(["bootstrap", "api_key", "guest_session"]);
export type TokenKind = z.infer<typeof TokenKind>;

export const EventType = z.enum(["created", "accessed", "revoked", "deleted", "expired"]);
export type EventType = z.infer<typeof EventType>;

export const ProvenanceFields = z.object({
  scope: z.string().optional(),
  run_id: z.string().optional(),
  step: z.string().optional(),
  producer: z.string().optional(),
  consumer: z.string().optional(),
  intent: z.string().optional(),
});
export type ProvenanceFields = z.infer<typeof ProvenanceFields>;
