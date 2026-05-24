// Contract tests: verify each tool's input/output schemas accept valid shapes.
// This guards against drift between the contracts package and the MCP tool registration.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CreateUploadRequestInput,
  CreateUploadRequestOutput,
  DeleteFileInput,
  DeleteFileOutput,
  ExtendFileExpiryInput,
  ExtendFileExpiryOutput,
  FetchFileInput,
  FetchFileOutput,
  FileInfoInput,
  FileInfoOutput,
  ListFilesInput,
  ListFilesOutput,
  ListRunArtifactsInput,
  ListRunArtifactsOutput,
  RevokeFileInput,
  RevokeFileOutput,
  StoreFileInput,
  StoreFileOutput,
  UploadRequestInfoInput,
  UploadRequestInfoOutput,
} from "@agentbox/contracts";

// Use crypto.randomUUID() so IDs satisfy Zod v4's strict RFC 4122 validation
const REF_ID = crypto.randomUUID();
const REQ_ID = crypto.randomUUID();
const NOW = new Date().toISOString();

const SAMPLE_REF = {
  id: REF_ID,
  shortid: "abc123",
  agent_link: `http://localhost:8080/v1/files/${REF_ID}`,
  human_link: `http://localhost:8080/v1/f/abc123`,
  sha256: "a".repeat(64),
  mime: "text/plain",
  size: 42,
  filename: "test.txt",
  direction: "serve" as const,
  scope: null,
  run_id: null,
  step: null,
  producer: null,
  consumer: null,
  intent: null,
  expires_at: null,
  grace_until: null,
  max_downloads: null,
  download_count: 0,
  revoked_at: null,
  deleted_at: null,
  created_at: NOW,
};

const SAMPLE_UPLOAD_REQUEST = {
  id: REQ_ID,
  shortid: "up123",
  upload_link: `http://localhost:8080/u/up123`,
  status: "pending" as const,
  filename_hint: null,
  scope: null,
  run_id: null,
  step: null,
  producer: null,
  consumer: null,
  intent: null,
  expires_at: NOW,
  allowed_mime_types: null,
  max_file_size_bytes: null,
  upload_count: 0,
  fulfilled_reference_id: null,
  created_at: NOW,
};

describe("MCP contract schemas", () => {
  it("store_file — input accepts URL-only call", () => {
    const result = StoreFileInput.safeParse({ url: "https://example.com/file.txt" });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("store_file — output matches ReferenceSchema", () => {
    const result = StoreFileOutput.safeParse(SAMPLE_REF);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("create_upload_request — expires_in is required", () => {
    assert.ok(CreateUploadRequestInput.safeParse({ expires_in: "1d" }).success);
    assert.equal(CreateUploadRequestInput.safeParse({}).success, false);
  });

  it("create_upload_request — output matches UploadRequestSchema", () => {
    const result = CreateUploadRequestOutput.safeParse(SAMPLE_UPLOAD_REQUEST);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("upload_request_info — input requires valid uuid", () => {
    assert.ok(UploadRequestInfoInput.safeParse({ id: REQ_ID }).success);
    assert.equal(UploadRequestInfoInput.safeParse({ id: "not-a-uuid" }).success, false);
  });

  it("upload_request_info — output accepts pending request without file", () => {
    const result = UploadRequestInfoOutput.safeParse(SAMPLE_UPLOAD_REQUEST);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("upload_request_info — output accepts completed request with file", () => {
    const result = UploadRequestInfoOutput.safeParse({
      ...SAMPLE_UPLOAD_REQUEST,
      status: "completed",
      fulfilled_reference_id: REF_ID,
      file: SAMPLE_REF,
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("fetch_file — input/output roundtrip", () => {
    assert.ok(FetchFileInput.safeParse({ id: REF_ID }).success);
    assert.ok(
      FetchFileOutput.safeParse({ url: "https://example.com/presigned", file: SAMPLE_REF })
        .success,
    );
  });

  it("file_info — input/output roundtrip", () => {
    assert.ok(FileInfoInput.safeParse({ id: REF_ID }).success);
    assert.ok(FileInfoOutput.safeParse(SAMPLE_REF).success);
  });

  it("revoke_file — input/output roundtrip", () => {
    assert.ok(RevokeFileInput.safeParse({ id: REF_ID }).success);
    assert.ok(RevokeFileOutput.safeParse({ id: REF_ID, revoked_at: NOW }).success);
  });

  it("delete_file — input/output roundtrip", () => {
    assert.ok(DeleteFileInput.safeParse({ id: REF_ID }).success);
    assert.ok(DeleteFileOutput.safeParse({ id: REF_ID, deleted_at: NOW }).success);
  });

  it("extend_file_expiry — input/output roundtrip", () => {
    assert.ok(ExtendFileExpiryInput.safeParse({ id: REF_ID, expires_in: "7d" }).success);
    assert.ok(ExtendFileExpiryOutput.safeParse({ id: REF_ID, expires_at: NOW }).success);
  });

  it("list_files — input accepts empty call (all optional)", () => {
    assert.ok(ListFilesInput.safeParse({}).success);
  });

  it("list_files — output matches ReferenceListSchema", () => {
    const result = ListFilesOutput.safeParse({ files: [SAMPLE_REF], total: 1 });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("list_run_artifacts — input/output roundtrip", () => {
    assert.ok(ListRunArtifactsInput.safeParse({ run_id: "run-abc" }).success);
    assert.ok(
      ListRunArtifactsOutput.safeParse({ run_id: "run-abc", files: [SAMPLE_REF], total: 1 })
        .success,
    );
  });
});
