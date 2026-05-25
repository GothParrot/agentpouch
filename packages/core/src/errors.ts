export class AgentPouchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusHint: number = 400,
  ) {
    super(message);
    this.name = "AgentPouchError";
  }
}

export class FileTooLargeError extends AgentPouchError {
  constructor(size: number, maxBytes: number) {
    super("FILE_TOO_LARGE", `File size ${size} exceeds limit ${maxBytes}`, 413);
  }
}

export class MimeTypeNotAllowedError extends AgentPouchError {
  constructor(mime: string) {
    super("MIME_NOT_ALLOWED", `MIME type ${mime} is not allowed`, 415);
  }
}

export class FileNotFoundError extends AgentPouchError {
  constructor(id: string) {
    super("NOT_FOUND", `File ${id} not found`, 404);
  }
}

export class FileRevokedError extends AgentPouchError {
  constructor() {
    super("FILE_REVOKED", "File has been revoked", 410);
  }
}

export class FileExpiredError extends AgentPouchError {
  constructor() {
    super("FILE_EXPIRED", "File has expired", 410);
  }
}

export class FileDeletedError extends AgentPouchError {
  constructor() {
    super("FILE_DELETED", "File has been deleted", 410);
  }
}

export class InvalidPresetError extends AgentPouchError {
  constructor(preset: string, allowed: string[]) {
    super("INVALID_PRESET", `Preset "${preset}" not allowed. Allowed: ${allowed.join(", ")}`, 400);
  }
}

export class PermissionDeniedError extends AgentPouchError {
  constructor(msg = "Permission denied") {
    super("PERMISSION_DENIED", msg, 403);
  }
}

export class UploadRequestNotFoundError extends AgentPouchError {
  constructor() {
    super("UPLOAD_REQUEST_NOT_FOUND", "Upload request not found", 404);
  }
}

export class UploadRequestExpiredError extends AgentPouchError {
  constructor() {
    super("UPLOAD_REQUEST_EXPIRED", "Upload request has expired", 410);
  }
}

export class UploadRequestAlreadyCompletedError extends AgentPouchError {
  constructor() {
    super("UPLOAD_REQUEST_COMPLETED", "Upload request has already been completed", 409);
  }
}

export class MaxDownloadsExceededError extends AgentPouchError {
  constructor() {
    super("MAX_DOWNLOADS_EXCEEDED", "Download limit reached", 410);
  }
}
