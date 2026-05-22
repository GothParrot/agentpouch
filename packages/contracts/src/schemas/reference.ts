import { z } from "@hono/zod-openapi";
import { Direction } from "../shared.js";

export const ReferenceSchema = z
  .object({
    id: z.string().uuid(),
    shortid: z.string(),
    agent_link: z.string().url(),
    human_link: z.string().url(),
    sha256: z.string().length(64),
    mime: z.string(),
    size: z.number().int().nonnegative(),
    filename: z.string(),
    direction: Direction,
    scope: z.string().nullable(),
    run_id: z.string().nullable(),
    step: z.string().nullable(),
    producer: z.string().nullable(),
    consumer: z.string().nullable(),
    intent: z.string().nullable(),
    expires_at: z.string().datetime().nullable(),
    grace_until: z.string().datetime().nullable(),
    max_downloads: z.number().int().nonnegative().nullable(),
    download_count: z.number().int().nonnegative(),
    revoked_at: z.string().datetime().nullable(),
    deleted_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi("Reference");

export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferenceListSchema = z
  .object({
    files: z.array(ReferenceSchema),
    cursor: z.string().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .openapi("ReferenceList");

export type ReferenceList = z.infer<typeof ReferenceListSchema>;
