import type { AuthContext } from "@agentbox/auth";
import type { Db } from "@agentbox/db";
import type { EventSink } from "@agentbox/events";
import type { KVStore } from "@agentbox/kv";
import type { Queue } from "@agentbox/queue";
import type { Scanner } from "@agentbox/scanner";
import type { StorageProvider } from "@agentbox/storage";

export type { AuthContext };

export type Logger = {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
};

export type CoreDeps = {
  db: Db;
  storage: StorageProvider;
  storageBackend: string;
  queue: Queue;
  kv: KVStore;
  events: EventSink;
  scanner: Scanner;
  logger: Logger;
  publicBaseUrl: string;
  allowedExpiryPresets: string[];
  defaultTtl: string;
  defaultMaxFileSizeBytes: number;
};
