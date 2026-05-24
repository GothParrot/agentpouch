import { serve } from "@hono/node-server";
import { loadConfig } from "@agentbox/config";
import { createDb, migrate } from "@agentbox/db";
import { createApp } from "@agentbox/server";
import { createLogger, MetricsStore } from "@agentbox/observability";
import { PostgresEventSink } from "@agentbox/events";
import { InMemoryKV } from "@agentbox/kv";
import { InlineQueue } from "@agentbox/queue";
import { NoopScanner } from "@agentbox/scanner";
import { LocalDiskStorage } from "@agentbox/storage-local";
import { S3Storage } from "@agentbox/storage-s3";
import { startReconciler } from "@agentbox/core";
import type { CoreDeps } from "@agentbox/core";
import { upsertBootstrapToken } from "./bootstrap.js";

const logger = createLogger({ level: "info" });

async function runMigrate(): Promise<void> {
  const config = loadConfig();
  logger.info("running migrations");
  await migrate(config.DATABASE_URL);
  logger.info("migrations complete");
  process.exit(0);
}

async function runServer(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL);

  if (config.AUTO_MIGRATE) {
    logger.info("AUTO_MIGRATE=true — running migrations at boot");
    await migrate(config.DATABASE_URL);
  }

  await upsertBootstrapToken(db, config.API_TOKEN, logger);

  const metrics = new MetricsStore();
  const publicBaseUrl = config.PUBLIC_BASE_URL ?? `http://localhost:${config.PORT}`;

  const storage =
    config.STORAGE === "s3"
      ? new S3Storage({
          bucket: config.S3_BUCKET ?? (() => { throw new Error("S3_BUCKET is required when STORAGE=s3"); })(),
          region: config.S3_REGION,
          ...(config.S3_ENDPOINT !== undefined ? { endpoint: config.S3_ENDPOINT } : {}),
          ...(config.S3_ACCESS_KEY_ID !== undefined ? { accessKeyId: config.S3_ACCESS_KEY_ID } : {}),
          ...(config.S3_SECRET_ACCESS_KEY !== undefined ? { secretAccessKey: config.S3_SECRET_ACCESS_KEY } : {}),
        })
      : new LocalDiskStorage(config.STORAGE_PATH);

  const core: CoreDeps = {
    db,
    storage,
    storageBackend: config.STORAGE,
    queue: new InlineQueue(),
    kv: new InMemoryKV({ maxSize: 5000 }),
    events: new PostgresEventSink(db),
    scanner: new NoopScanner(),
    logger,
    publicBaseUrl,
    allowedExpiryPresets: config.ALLOWED_EXPIRY_PRESETS,
    defaultTtl: config.DEFAULT_TTL,
    defaultMaxFileSizeBytes: config.MAX_FILE_SIZE,
  };

  const stopReconciler = startReconciler(core, 60_000);

  const app = createApp({
    core,
    logger,
    metrics,
    options: {
      ...(config.SHORTLINK_DOMAIN !== undefined ? { shortlinkDomain: config.SHORTLINK_DOMAIN } : {}),
      enableGuestMode: config.ENABLE_GUEST_MODE,
      maxFileSizeBytes: config.MAX_FILE_SIZE,
      allowedExpiryPresets: config.ALLOWED_EXPIRY_PRESETS,
      defaultTtl: config.DEFAULT_TTL,
      guestMaxFileSizeBytes: config.GUEST_MAX_FILE_SIZE,
      guestMaxTtl: config.GUEST_MAX_TTL,
    },
  });

  const server = serve({ fetch: app.fetch, port: config.PORT }, () => {
    logger.info("agentbox listening", { port: config.PORT, publicBaseUrl });
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      stopReconciler();
      server.close();
    });
  }
}

const command = process.argv[2];

if (command === "migrate") {
  await runMigrate();
} else {
  await runServer();
}
