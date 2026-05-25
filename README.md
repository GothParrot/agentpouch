# AgentPouch

AgentPouch is a self-hostable file handoff service for AI agents. It gives agents a place to store files, generate shareable links for humans, and receive uploads from humans — all without requiring any code changes to your application. Agents interact through a REST API or a built-in MCP server; humans receive clean download or upload links that work in any browser.

---

## Self-host quickstart

### Development / internal use

Start AgentPouch with a single Docker Compose command. No domain or TLS required.

```bash
# Clone and start
git clone https://github.com/agentpouch-sh/agentpouch
cd agentpouch
docker compose up -d
```

The server starts on `http://localhost:8080`. Your API token is `dev-token-change-me` — change it in `docker-compose.yml` before sharing access.

**Or run with a single docker command** (bring your own Postgres):

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

Point a domain at your server, then run with Caddy for automatic TLS via Let's Encrypt.

**1. Copy and edit the env file:**

```bash
cp .env.example .env.prod
# Edit .env.prod — at minimum set DOMAIN, DB_PASSWORD, and API_TOKEN
```

**.env.prod minimum:**

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

## Connect an AI agent via MCP

Add this block to your project's `.claude/settings.json`:

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

For guest mode (no token), omit the `headers` key entirely. For production, swap `localhost:8080` for your domain and update the token.

The agent immediately gets 10 tools: `store_file`, `fetch_file`, `file_info`, `create_upload_request`, `upload_request_info`, `revoke_file`, `delete_file`, `extend_file_expiry`, `list_files`, `list_run_artifacts`.

---

## CLI

Install:

```bash
npm install -g @agentpouch/cli
```

Upload a file (guest mode, hosted service):

```bash
agentpouch upload ./report.pdf
```

Upload to your self-hosted instance with a token:

```bash
agentpouch upload ./report.pdf --url http://localhost:8080 --token dev-token-change-me
```

All commands:

```bash
agentpouch upload <file> [--expires-in <preset>] [--filename <name>] [--json]
agentpouch download <id-or-url>
agentpouch upload-request create --expires-in <preset> [--filename-hint <name>] [--json]
agentpouch upload-request info <id> [--json]
agentpouch file info <id> [--json]
agentpouch file revoke <id>
agentpouch file delete <id>
agentpouch file extend <id> --ttl <preset>
```

Set defaults via environment:

```bash
export AGENTPOUCH_URL=http://localhost:8080
export AGENTPOUCH_API_KEY=dev-token-change-me
```

---

## Expiry presets

| Preset | Duration |
|--------|----------|
| `10m`  | 10 minutes |
| `1d`   | 1 day |
| `3d`   | 3 days |
| `7d`   | 7 days (default) |
| `30d`  | 30 days |

Files without an explicit expiry never expire (subject to your `DEFAULT_TTL` server config).

---

## Storage backends

| Backend | Config | Notes |
|---------|--------|-------|
| Local disk | `STORAGE=local` | Default. Files stored at `STORAGE_PATH` (`/data`). Back up this volume. |
| AWS S3 | `STORAGE=s3` | Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| Cloudflare R2 | `STORAGE=s3` | Set `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_BUCKET` |
| MinIO | `STORAGE=s3` | Set `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET`, credentials |
| Backblaze B2 | `STORAGE=s3` | Set `S3_ENDPOINT=https://s3.<region>.backblazeb2.com`, `S3_BUCKET` |

See [docs/storage.md](./docs/storage.md) for full configuration details.

---

## Security note

**AgentPouch v0 does not scan uploaded files for malware.** All files are stored and served as-is. If you enable guest mode or expose your instance publicly, ensure you understand the implications. Malware scanning via ClamAV or a cloud scanning service is planned for v0.1.

---

## Hosted vs self-hosted

| | Self-hosted | Hosted (agentpouch.sh) |
|---|---|---|
| Domain required | Yes (for production TLS) | No — domain and TLS provided |
| Server required | Yes | No |
| TLS setup | Automatic via Caddy | Automatic |
| Data residency | Your server | AgentPouch infrastructure |
| Guest mode | Opt-in | Available on free tier |
| Setup time | ~5 minutes | Instant |

On the hosted service, agents and developers need no domain, no server, and no TLS setup. Point your MCP client at `https://agentpouch.sh/v1/mcp` and go.

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
