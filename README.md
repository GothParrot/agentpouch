# AgentPouch

A file handoff service for AI agents. Agents store files, generate shareable links for humans, and receive uploads from humans — via a REST API or a built-in MCP server. Humans get clean download or upload links that work in any browser, no account required.

---

## Quickstart — hosted (no setup)

```bash
curl -X POST https://agentpouch.sh/v1/ingest \
  -F "file=@./report.pdf"
# → { "human_link": "https://agentpouch.sh/v1/f/abc123", ... }
```

No token, no account, no server. Guest uploads expire after 1 day and are capped at 10 MB.

**Via MCP** — add this to your project's `.claude/settings.json`:

```jsonc
{
  "mcpServers": {
    "agentpouch": {
      "type": "http",
      "url": "https://agentpouch.sh/v1/mcp"
    }
  }
}
```

For longer retention, larger files, or private instances, self-host.

---

## Self-host quickstart

### Development / internal use

```bash
git clone https://github.com/agentpouch-sh/agentpouch
cd agentpouch
docker compose up -d
```

The server starts on `http://localhost:8080`. The default API token is `dev-token-change-me` — change it in `docker-compose.yml` before sharing access.

**Single-container (bring your own Postgres):**

```bash
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL="postgres://user:pass@host:5432/agentpouch" \
  -e API_TOKEN="$(openssl rand -hex 32)" \
  -e AUTO_MIGRATE=true \
  -e PUBLIC_BASE_URL="http://localhost:8080" \
  -v agentpouch_data:/data \
  agentpouch/agentpouch
```

### Production (public human-facing links)

Point a domain at your server and run with Caddy for automatic TLS.

**1. Create your env file:**

```bash
cp .env.example .env.prod
# Set DOMAIN, DB_PASSWORD, and API_TOKEN at minimum
```

```env
DOMAIN=files.your-domain.example.com
DB_PASSWORD=<long random string>
API_TOKEN=<long random string>
```

**2. Start:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Caddy automatically obtains and renews a TLS certificate. Files get `https://files.your-domain.example.com/v1/f/<shortid>` links immediately.

---

## Connect an AI agent via MCP (self-hosted)

```jsonc
{
  "mcpServers": {
    "agentpouch": {
      "type": "http",
      "url": "http://localhost:8080/v1/mcp",
      "headers": {
        "Authorization": "Bearer dev-token-change-me"
      }
    }
  }
}
```

Replace `localhost:8080` with your domain and update the token for production. To enable guest mode on your instance, set `ENABLE_GUEST_MODE=true` and omit `headers`.

The agent gets 10 tools immediately:

| Tool | What it does |
|---|---|
| `store_file` | Fetch a URL and store it |
| `fetch_file` | Get a download URL for a stored file |
| `file_info` | Get metadata without fetching bytes |
| `create_upload_request` | Generate a link for a human to upload a file |
| `upload_request_info` | Poll an upload request for completion |
| `revoke_file` | Invalidate a file's link |
| `delete_file` | Soft-delete a file |
| `extend_file_expiry` | Push a file's expiry forward |
| `list_files` | List files, with optional filters |
| `list_run_artifacts` | List all files for a given `run_id` |

---

## REST API

The full OpenAPI spec is served at `/openapi.json` on any running instance.

Key endpoints:

```
POST   /v1/ingest                    Upload or fetch a file
GET    /v1/files                     List files
GET    /v1/files/:id                 File metadata
GET    /v1/files/:id/download        Download file bytes
POST   /v1/files/:id/revoke          Revoke a file
DELETE /v1/files/:id                 Soft-delete a file
POST   /v1/files/:id/erase           Hard-delete (GDPR) — bootstrap token only
POST   /v1/files/:id/extend          Extend expiry
POST   /v1/upload-requests           Create an upload request
GET    /v1/upload-requests/:id       Get upload request status
GET    /v1/f/:shortid                Human-facing download page or file bytes
POST   /u/:shortid                   Human-facing upload form submission
GET    /healthz                      Liveness and readiness check
```

All `/v1` routes require `Authorization: Bearer <token>` unless guest mode is enabled.

---

## Expiry presets

| Preset | Duration |
|--------|----------|
| `10m`  | 10 minutes |
| `1d`   | 1 day |
| `3d`   | 3 days |
| `7d`   | 7 days (default) |
| `30d`  | 30 days |

---

## Storage backends

| Backend | Config | Notes |
|---------|--------|-------|
| Local disk | `STORAGE=local` | Default. Files stored at `STORAGE_PATH` (`/data`). Back up this volume. |
| AWS S3 | `STORAGE=s3` | Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| Cloudflare R2 | `STORAGE=s3` | Set `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_BUCKET` |
| MinIO | `STORAGE=s3` | Set `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET`, credentials |
| Backblaze B2 | `STORAGE=s3` | Set `S3_ENDPOINT=https://s3.<region>.backblazeb2.com`, `S3_BUCKET` |

See [docs/storage.md](./docs/storage.md) for full details.

---

## Configuration reference

Copy `.env.example` to `.env` and edit. All variables with defaults are optional.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string (required) |
| `API_TOKEN` | — | Bearer token for authenticated requests (required) |
| `PUBLIC_BASE_URL` | `http://localhost:PORT` | Base URL embedded in `agent_link` and `human_link` |
| `PORT` | `8080` | HTTP listen port |
| `AUTO_MIGRATE` | `false` | Run DB migrations on startup |
| `STORAGE` | `local` | Storage backend: `local` or `s3` |
| `STORAGE_PATH` | `/data` | Local storage root directory |
| `S3_BUCKET` | — | S3 bucket name |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ENDPOINT` | — | Custom endpoint (R2, MinIO, B2) |
| `S3_ACCESS_KEY_ID` | — | S3 credentials |
| `S3_SECRET_ACCESS_KEY` | — | S3 credentials |
| `ENABLE_GUEST_MODE` | `false` | Allow unauthenticated uploads |
| `GUEST_MAX_FILE_SIZE` | `10485760` | Per-upload cap for guests (bytes) |
| `GUEST_MAX_TTL` | `1d` | Max expiry preset for guest uploads |
| `MAX_FILE_SIZE` | `107374182400` | Server-wide upload cap (bytes) |
| `DEFAULT_TTL` | `7d` | Default expiry when none specified |
| `ALLOWED_EXPIRY_PRESETS` | `10m,1d,3d,7d,30d` | Comma-separated allowed presets |
| `SHORTLINK_DOMAIN` | — | Optional vanity domain for short links |

---

## Security note

**AgentPouch v0 does not scan uploaded files for malware.** All files are stored and served as-is. If you enable guest mode or expose your instance publicly, ensure you understand the implications.
