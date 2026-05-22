const PRESET_MS: Record<string, number> = {
  "10m": 10 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function expiresAtFromPreset(preset: string): Date {
  const ms = PRESET_MS[preset];
  if (ms === undefined) throw new Error(`Unknown preset: ${preset}`);
  return new Date(Date.now() + ms);
}

const SHORTID_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateShortId(length = 10): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => SHORTID_CHARS[b % SHORTID_CHARS.length] ?? "0")
    .join("");
}

/** Drains a ReadableStream, hashes contents with SHA-256, returns bytes + hash + size. */
export async function collectStream(
  body: ReadableStream<Uint8Array>,
): Promise<{ sha256: string; size: number; data: Uint8Array }> {
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      chunks.push(value);
      size += value.byteLength;
    }
  }

  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  const hashBuf = await globalThis.crypto.subtle.digest("SHA-256", data);
  const sha256 = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { sha256, size, data };
}

export function bytesToStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}
