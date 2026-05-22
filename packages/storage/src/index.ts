export type ServeStrategy = { type: "stream" } | { type: "redirect"; url: string; expiresAt: Date };

export type PutOptions = {
  contentType: string;
  size?: number;
};

export interface StorageProvider {
  put(key: string, body: ReadableStream<Uint8Array>, opts: PutOptions): Promise<void>;
  get(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  getServeStrategy(key: string, opts?: { ttlSeconds?: number }): ServeStrategy;
}
