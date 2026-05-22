import { eq } from "drizzle-orm";
import { hashToken } from "@agentbox/auth";
import { type Db, tokens } from "@agentbox/db";
import type { Logger } from "@agentbox/observability";

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
