import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { StorageProvider } from "@agentbox/storage";

async function readAll(readable: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { c.enqueue(data); c.close(); } });
}

export function runStorageConformanceSuite(
  name: string,
  factory: () => Promise<StorageProvider>,
  expectedStrategyType: "stream" | "redirect",
): void {
  describe(name, () => {
    let storage: StorageProvider;

    before(async () => {
      storage = await factory();
    });

    it("put + get round-trips content", async () => {
      const key = `test${crypto.randomUUID().replace(/-/g, "")}`;
      const data = randomBytes(64);
      await storage.put(key, toStream(data), { contentType: "application/octet-stream" });
      const got = await readAll(await storage.get(key));
      assert.deepEqual(got, Buffer.from(data));
      await storage.delete(key);
    });

    it("delete removes the object", async () => {
      const key = `test${crypto.randomUUID().replace(/-/g, "")}`;
      await storage.put(key, toStream(randomBytes(8)), { contentType: "application/octet-stream" });
      await storage.delete(key);
      await assert.rejects(async () => {
        const stream = await storage.get(key);
        await readAll(stream);
      });
    });

    it("delete of nonexistent key does not throw", async () => {
      await storage.delete(`testnonexistent${crypto.randomUUID().replace(/-/g, "")}`);
    });

    it(`getServeStrategy returns type="${expectedStrategyType}"`, async () => {
      const key = `test${crypto.randomUUID().replace(/-/g, "")}`;
      await storage.put(key, toStream(randomBytes(8)), { contentType: "application/octet-stream" });
      const strategy = await storage.getServeStrategy(key);
      assert.equal(strategy.type, expectedStrategyType);
      if (strategy.type === "redirect") {
        assert.ok(strategy.url.startsWith("http"), `URL should start with http: ${strategy.url}`);
        assert.ok(strategy.expiresAt instanceof Date, "expiresAt should be a Date");
      }
      await storage.delete(key);
    });
  });
}
