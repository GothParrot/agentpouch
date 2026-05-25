import { hashToken } from "@agentpouch/auth";
import { type Db, tokens } from "@agentpouch/db";
import type { Logger } from "@agentpouch/observability";
import { eq } from "drizzle-orm";

export async function upsertBootstrapToken(
  db: Db,
  apiToken: string,
  logger: Logger,
): Promise<void> {
  const tokenHash = await hashToken(apiToken);

  const existing = await db.query.tokens.findFirst({
    where: eq(tokens.tokenHash, tokenHash),
  });

  if (existing) {
    logger.debug("bootstrap token already exists");
    return;
  }

  await db.insert(tokens).values({
    tokenHash,
    kind: "bootstrap",
    name: "bootstrap",
  });

  logger.info("bootstrap token created");
}
