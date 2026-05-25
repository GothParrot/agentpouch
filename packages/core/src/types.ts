import type { AuthContext } from "@agentpouch/auth";
import type { Db } from "@agentpouch/db";
import type { EventSink } from "@agentpouch/events";
import type { KVStore } from "@agentpouch/kv";
import type { Queue } from "@agentpouch/queue";
import type { Scanner } from "@agentpouch/scanner";
import type { StorageProvider } from "@agentpouch/storage";

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
