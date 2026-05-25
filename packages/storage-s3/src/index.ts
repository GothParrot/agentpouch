import type { PutOptions, ServeStrategy, StorageProvider } from "@agentpouch/storage";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type S3StorageOptions = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  presignedUrlTtlSeconds?: number;
};

export class S3Storage implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly presignedUrlTtlSeconds: number;

  constructor(opts: S3StorageOptions) {
    this.bucket = opts.bucket;
    this.presignedUrlTtlSeconds = opts.presignedUrlTtlSeconds ?? 3600;
    this.client = new S3Client({
      region: opts.region ?? "us-east-1",
      ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
      ...(opts.accessKeyId && opts.secretAccessKey
        ? { credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } }
        : {}),
      forcePathStyle: !!opts.endpoint, // required for MinIO, R2, B2
    });
  }

  async put(key: string, body: ReadableStream<Uint8Array>, opts: PutOptions): Promise<void> {
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: opts.contentType,
        ContentLength: buffer.byteLength,
      }),
    );
  }

  async get(key: string): Promise<ReadableStream<Uint8Array>> {
    const resp = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!resp.Body) throw new Error(`S3 object not found: ${key}`);
    const nodeStream = resp.Body as unknown as import("node:stream").Readable;
    const { Readable } = await import("node:stream");
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getServeStrategy(key: string, opts?: { ttlSeconds?: number }): Promise<ServeStrategy> {
    const ttl = opts?.ttlSeconds ?? this.presignedUrlTtlSeconds;
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: ttl });
    const expiresAt = new Date(Date.now() + ttl * 1000);
    return { type: "redirect", url, expiresAt };
  }
}
