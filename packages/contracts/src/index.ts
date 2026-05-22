export { extendZodWithOpenApi, z } from "@hono/zod-openapi";

// Shared enums and field schemas
export {
  Direction,
  EventType,
  ExpiryPreset,
  ProvenanceFields,
  TokenKind,
  UploadRequestStatus,
} from "./shared.js";
export type { Direction as DirectionType, ExpiryPreset as ExpiryPresetType } from "./shared.js";

// Entity schemas
export { ErrorSchema } from "./schemas/error.js";
export type { ApiError } from "./schemas/error.js";
export { ReferenceListSchema, ReferenceSchema } from "./schemas/reference.js";
export type { Reference, ReferenceList } from "./schemas/reference.js";
export {
  UploadRequestSchema,
  UploadRequestWithFileSchema,
} from "./schemas/upload-request.js";
export type { UploadRequest, UploadRequestWithFile } from "./schemas/upload-request.js";

// HTTP route definitions
export { healthzRoute } from "./routes/health.js";
export {
  deleteFileRoute,
  eraseFileRoute,
  extendFileRoute,
  fileDownloadRoute,
  fileInfoRoute,
  listFilesRoute,
  revokeFileRoute,
  shortLinkRoute,
} from "./routes/files.js";
export {
  IngestFormSchema,
  IngestUrlSchema,
  ingestRoute,
} from "./routes/ingest.js";
export type { IngestForm, IngestUrl } from "./routes/ingest.js";
export {
  CreateUploadRequestBodySchema,
  createUploadRequestRoute,
  getUploadRequestRoute,
  uploadPageRoute,
  uploadSubmitRoute,
} from "./routes/upload-requests.js";
export type { CreateUploadRequestBody } from "./routes/upload-requests.js";
export { RunManifestSchema, listRunArtifactsRoute } from "./routes/runs.js";
export type { RunManifest } from "./routes/runs.js";

// MCP tool input/output schemas
export {
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
} from "./mcp.js";
export type {
  CreateUploadRequestInput as CreateUploadRequestInputType,
  DeleteFileInput as DeleteFileInputType,
  ExtendFileExpiryInput as ExtendFileExpiryInputType,
  FetchFileInput as FetchFileInputType,
  FileInfoInput as FileInfoInputType,
  ListFilesInput as ListFilesInputType,
  ListRunArtifactsInput as ListRunArtifactsInputType,
  RevokeFileInput as RevokeFileInputType,
  StoreFileInput as StoreFileInputType,
  UploadRequestInfoInput as UploadRequestInfoInputType,
} from "./mcp.js";
