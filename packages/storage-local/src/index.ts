import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { PutOptions, ServeStrategy, StorageProvider } from "@agentbox/storage";

export class LocalDiskStorage implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private keyToPath(key: string): string {
    // content-addressed layout: first 2 hex chars as subdir to avoid large flat dirs
    return join(this.baseDir, key.slice(0, 2), key.slice(2));
  }

  async put(key: string, body: ReadableStream<Uint8Array>, _opts: PutOptions): Promise<void> {
    const dest = this.keyToPath(key);
    await mkdir(join(this.baseDir, key.slice(0, 2)), { recursive: true });
    await pipeline(
      Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>),
      createWriteStream(dest),
    );
  }

  async get(key: string): Promise<ReadableStream<Uint8Array>> {
    const src = createReadStream(this.keyToPath(key));
    return Readable.toWeb(src) as ReadableStream<Uint8Array>;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.keyToPath(key));
    } catch {
      // not found — ignore
    }
  }

  async getServeStrategy(_key: string, _opts?: { ttlSeconds?: number }): Promise<ServeStrategy> {
    return { type: "stream" };
  }
}
