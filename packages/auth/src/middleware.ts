import { eq } from "drizzle-orm";
import type { Db } from "@agentpouch/db";
import { tokens } from "@agentpouch/db";
import type { Context, MiddlewareHandler, Next } from "hono";
import { hashToken } from "./hash.js";
import { resolvePolicy, type DefaultLimits } from "./policy.js";
import type { AuthContext } from "./types.js";

export type AuthMiddlewareOptions = {
  db: Db;
  enableGuestMode: boolean;
  defaults: DefaultLimits;
};

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function createAuthMiddleware(opts: AuthMiddlewareOptions): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("authorization");

    if (!authHeader) {
      if (opts.enableGuestMode) {
        // Transient guest — real guest session persistence is wired in Step 9
        c.set("auth", {
          kind: "guest_session",
          tokenId: "guest",
          tenantId: null,
          accountId: null,
          policy: resolvePolicy(
            {
              id: "guest",
              kind: "guest_session",
              tenantId: null,
              accountId: null,
              tokenHash: "",
              name: null,
              createdAt: new Date(),
              revokedAt: null,
              maxFileSizeBytes: null,
              allowedMimeTypes: null,
              storageQuotaBytes: null,
              storageUsedBytes: "0",
              rateLimitRpm: null,
            },
            opts.defaults,
          ),
        });
        return next();
      }
      return c.json({ error: "Unauthorized" }, 401);
    }

    const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!raw) return c.json({ error: "Unauthorized" }, 401);

    const tokenHash = await hashToken(raw);

    const token = await opts.db.query.tokens.findFirst({
      where: eq(tokens.tokenHash, tokenHash),
    });

    if (!token || token.revokedAt) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("auth", {
      kind: token.kind,
      tokenId: token.id,
      tenantId: token.tenantId,
      accountId: token.accountId,
      policy: resolvePolicy(token, opts.defaults),
    });

    return next();
  };
}
