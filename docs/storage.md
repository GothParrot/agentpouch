# Storage Backends

AgentPouch supports two storage backends: **local disk** (default) and **S3-compatible** object storage.

Set `STORAGE=local` or `STORAGE=s3` in your environment.

---

## Local Disk

```env
STORAGE=local
STORAGE_PATH=/data      # mount a Docker volume here
```

Files are stored content-addressed by SHA-256. Serving streams bytes through the app process.

---

## S3-Compatible (AWS S3 / Cloudflare R2 / MinIO / Backblaze B2)

```env
STORAGE=s3
S3_BUCKET=my-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# Omit for AWS S3; required for R2, MinIO, B2:
S3_ENDPOINT=https://...
```

Serving issues a presigned redirect (302) — file bytes never pass through the app process.

### Provider-specific settings

| Provider | `S3_ENDPOINT` | `S3_REGION` |
|---|---|---|
| AWS S3 | _(omit)_ | e.g. `us-east-1` |
| Cloudflare R2 | `https://<account_id>.r2.cloudflarestorage.com` | `auto` |
| MinIO | `http://minio:9000` | `us-east-1` (any value works) |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | e.g. `us-west-004` |

### Bucket setup

Create the bucket before starting AgentPouch. The bucket does not need to be public — presigned URLs are time-limited and signed with your credentials.

Presigned URL TTL defaults to 3600 seconds (1 hour) and is not currently configurable per-request.
