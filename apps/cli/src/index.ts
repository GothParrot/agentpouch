#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { AgentPouchClient, AgentPouchError } from "@agentpouch/client";
import type { ExpiryPreset } from "@agentpouch/client";

// ─── Config ──────────────────────────────────────────────────────────────────

const { AGENTPOUCH_URL: envUrl, AGENTPOUCH_API_KEY: envKey } = process.env;
const DEFAULT_BASE_URL = envUrl ?? "https://agentpouch.sh";

function makeClient(baseUrl: string, apiKey?: string): AgentPouchClient {
  const key = apiKey ?? envKey;
  return new AgentPouchClient({ baseUrl, ...(key !== undefined ? { apiKey: key } : {}) });
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function out(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else if (typeof data === "string") {
    process.stdout.write(data + "\n");
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

function die(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

// ─── Usage ───────────────────────────────────────────────────────────────────

const USAGE = `
agentpouch — file handoff service CLI

Usage:
  agentpouch upload <file>              Upload a file
  agentpouch download <id-or-url>       Download a file to stdout
  agentpouch upload-request create      Create an upload request link
  agentpouch upload-request info <id>   Poll upload request status
  agentpouch file info <id>             Get file metadata
  agentpouch file revoke <id>           Revoke a file link
  agentpouch file delete <id>           Soft-delete a file
  agentpouch file extend <id>           Extend file expiry

Global flags:
  --url <url>          Server base URL (default: $AGENTPOUCH_URL or https://agentpouch.sh)
  --token <key>        API key (default: $AGENTPOUCH_API_KEY, omit for guest mode)
  --json               Machine-readable JSON output

upload flags:
  --expires-in <preset>  Expiry preset: 10m 1d 3d 7d 30d
  --filename <name>      Override filename

upload-request create flags:
  --expires-in <preset>  Required expiry preset
  --filename-hint <name> Hint for the human uploader

file extend flags:
  --ttl <preset>         New expiry preset (required)
`.trimStart();

// ─── Argument parsing ─────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    url: { type: "string" },
    token: { type: "string" },
    json: { type: "boolean", default: false },
    "expires-in": { type: "string" },
    "filename-hint": { type: "string" },
    filename: { type: "string" },
    ttl: { type: "string" },
    help: { type: "boolean", default: false },
    h: { type: "boolean", default: false },
  },
});

if (values["help"] || values["h"] || positionals.length === 0) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const baseUrl = (values["url"] as string | undefined) ?? DEFAULT_BASE_URL;
const apiKey = values["token"] as string | undefined;
const json = Boolean(values["json"]);
const client = makeClient(baseUrl, apiKey);

const [cmd, sub, arg] = positionals;

// ─── Command dispatch ─────────────────────────────────────────────────────────

async function cmdUpload(): Promise<void> {
  const filePath = sub;
  if (!filePath) die("usage: agentpouch upload <file>");

  try {
    statSync(filePath);
  } catch {
    die(`file not found: ${filePath}`);
  }

  const filename = (values["filename"] as string | undefined) ?? basename(filePath);
  const expiresIn = values["expires-in"] as ExpiryPreset | undefined;

  const buf = readFileSync(filePath);
  const file = new File([buf.buffer], filename, { type: "application/octet-stream" });

  const ref = await client.upload(file, {
    filename,
    ...(expiresIn ? { expires_in: expiresIn } : {}),
  });

  if (json) {
    out(ref, true);
  } else {
    out(`id:         ${ref.id}`, false);
    out(`human_link: ${ref.human_link}`, false);
    out(`agent_link: ${ref.agent_link}`, false);
    out(`expires_at: ${ref.expires_at ?? "never"}`, false);
  }
}

async function cmdDownload(): Promise<void> {
  let id = sub;
  if (!id) die("usage: agentpouch download <id-or-url>");

  // Accept agent_link URLs: extract UUID at end
  const uuidMatch = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(id);
  if (uuidMatch?.[1]) id = uuidMatch[1];

  const url = await client.downloadUrl(id);
  const res = await fetch(url);
  if (!res.ok || !res.body) die(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) process.stdout.write(value);
  }
}

async function cmdUploadRequest(): Promise<void> {
  if (sub === "create") {
    const expiresIn = values["expires-in"] as ExpiryPreset | undefined;
    if (!expiresIn) die("--expires-in is required for upload-request create");
    const filenameHint = values["filename-hint"] as string | undefined;

    const req = await client.createUploadRequest({
      expires_in: expiresIn,
      ...(filenameHint ? { filename_hint: filenameHint } : {}),
    });

    if (json) {
      out(req, true);
    } else {
      out(`id:          ${req.id}`, false);
      out(`upload_link: ${req.upload_link}`, false);
      out(`expires_at:  ${req.expires_at}`, false);
      out(`status:      ${req.status}`, false);
    }
    return;
  }

  if (sub === "info") {
    const id = arg;
    if (!id) die("usage: agentpouch upload-request info <id>");
    const req = await client.getUploadRequest(id);
    out(req, json);
    return;
  }

  die(`unknown upload-request subcommand: ${sub ?? "(none)"}. Try: create, info`);
}

async function cmdFile(): Promise<void> {
  const id = arg;

  if (sub === "info") {
    if (!id) die("usage: agentpouch file info <id>");
    const ref = await client.fileInfo(id);
    out(ref, json);
    return;
  }

  if (sub === "revoke") {
    if (!id) die("usage: agentpouch file revoke <id>");
    const result = await client.revokeFile(id);
    out(json ? result : `revoked: ${result.revoked_at}`, json);
    return;
  }

  if (sub === "delete") {
    if (!id) die("usage: agentpouch file delete <id>");
    await client.deleteFile(id);
    out(json ? { id, deleted: true } : `deleted: ${id}`, json);
    return;
  }

  if (sub === "extend") {
    if (!id) die("usage: agentpouch file extend <id> --ttl <preset>");
    const ttl = values["ttl"] as ExpiryPreset | undefined;
    if (!ttl) die("--ttl is required for file extend");
    const result = await client.extendExpiry(id, ttl);
    out(json ? result : `expires_at: ${result.expires_at}`, json);
    return;
  }

  die(`unknown file subcommand: ${sub ?? "(none)"}. Try: info, revoke, delete, extend`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    if (cmd === "upload") return await cmdUpload();
    if (cmd === "download") return await cmdDownload();
    if (cmd === "upload-request") return await cmdUploadRequest();
    if (cmd === "file") return await cmdFile();
    die(`unknown command: ${cmd}. Run agentpouch --help for usage.`);
  } catch (err) {
    if (err instanceof AgentPouchError) {
      die(`${err.status}: ${err.message}`);
    }
    throw err;
  }
}

main();
