import type {
  CreateUploadRequestBody,
  Reference,
  ReferenceList,
  RunManifest,
  UploadRequest,
  UploadRequestWithFile,
} from "@agentpouch/contracts";

export type { Reference, ReferenceList, RunManifest, UploadRequest, UploadRequestWithFile };

export type ExpiryPreset = "10m" | "1d" | "3d" | "7d" | "30d";

export type ProvenanceOpts = {
  scope?: string;
  run_id?: string;
  step?: string;
  producer?: string;
  consumer?: string;
  intent?: string;
};

export type UploadOpts = ProvenanceOpts & {
  filename?: string;
  expires_in?: ExpiryPreset;
  max_downloads?: number;
  idempotency_key?: string;
};

export type UploadUrlOpts = UploadOpts & {
  url: string;
};

export type ListFilesOpts = {
  scope?: string;
  run_id?: string;
  consumer?: string;
  intent?: string;
  limit?: number;
  cursor?: string;
};

export type CreateUploadRequestOpts = CreateUploadRequestBody;

export class AgentPouchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgentPouchError";
  }
}

export class AgentPouchClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(opts: { baseUrl: string; apiKey?: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.headers = { "content-type": "application/json" };
    if (opts.apiKey) this.headers["authorization"] = `Bearer ${opts.apiKey}`;
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; headers?: Record<string, string>; isForm?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = { ...this.headers };
    if (opts?.headers) Object.assign(headers, opts.headers);

    let fetchBody: string | FormData | null = null;
    if (opts?.isForm && opts.body instanceof FormData) {
      delete headers["content-type"];
      fetchBody = opts.body;
    } else if (opts?.body !== undefined) {
      fetchBody = JSON.stringify(opts.body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(fetchBody !== null ? { body: fetchBody } : {}),
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { error?: string };
        if (err.error) message = err.error;
      } catch {
        // ignore parse error
      }
      throw new AgentPouchError(res.status, message);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async upload(file: File | Blob, opts: UploadOpts = {}): Promise<Reference> {
    const form = new FormData();
    form.append("file", file);
    if (opts.filename) form.append("filename", opts.filename);
    if (opts.expires_in) form.append("expires_in", opts.expires_in);
    if (opts.max_downloads !== undefined) form.append("max_downloads", String(opts.max_downloads));
    if (opts.scope) form.append("scope", opts.scope);
    if (opts.run_id) form.append("run_id", opts.run_id);
    if (opts.step) form.append("step", opts.step);
    if (opts.producer) form.append("producer", opts.producer);
    if (opts.consumer) form.append("consumer", opts.consumer);
    if (opts.intent) form.append("intent", opts.intent);

    const extraHeaders: Record<string, string> = {};
    if (opts.idempotency_key) extraHeaders["idempotency-key"] = opts.idempotency_key;

    return this.request<Reference>("POST", "/v1/ingest", {
      body: form,
      headers: extraHeaders,
      isForm: true,
    });
  }

  async uploadUrl(opts: UploadUrlOpts): Promise<Reference> {
    const { url, idempotency_key, ...rest } = opts;
    const extraHeaders: Record<string, string> = {};
    if (idempotency_key) extraHeaders["idempotency-key"] = idempotency_key;

    return this.request<Reference>("POST", "/v1/ingest", {
      body: { url, ...rest },
      headers: extraHeaders,
    });
  }

  async fileInfo(id: string): Promise<Reference> {
    return this.request<Reference>("GET", `/v1/files/${id}`);
  }

  async downloadUrl(id: string): Promise<string> {
    // Follow redirects manually to capture the presigned URL
    const res = await fetch(`${this.baseUrl}/v1/files/${id}/download`, {
      method: "GET",
      headers: { ...this.headers },
      redirect: "manual",
    });
    if (res.status === 302) {
      const loc = res.headers.get("location");
      if (loc) return loc;
    }
    if (!res.ok) throw new AgentPouchError(res.status, `HTTP ${res.status}`);
    // Local storage — return the direct URL (caller streams from it)
    return `${this.baseUrl}/v1/files/${id}/download`;
  }

  async listFiles(opts: ListFilesOpts = {}): Promise<ReferenceList> {
    const params = new URLSearchParams();
    if (opts.scope) params.set("scope", opts.scope);
    if (opts.run_id) params.set("run_id", opts.run_id);
    if (opts.consumer) params.set("consumer", opts.consumer);
    if (opts.intent) params.set("intent", opts.intent);
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.cursor) params.set("cursor", opts.cursor);
    const qs = params.toString();
    return this.request<ReferenceList>("GET", `/v1/files${qs ? `?${qs}` : ""}`);
  }

  async revokeFile(id: string): Promise<{ id: string; revoked_at: string }> {
    return this.request<{ id: string; revoked_at: string }>("POST", `/v1/files/${id}/revoke`);
  }

  async deleteFile(id: string): Promise<void> {
    return this.request<void>("DELETE", `/v1/files/${id}`);
  }

  async eraseFile(id: string): Promise<void> {
    return this.request<void>("POST", `/v1/files/${id}/erase`);
  }

  async extendExpiry(
    id: string,
    expires_in: ExpiryPreset,
  ): Promise<{ id: string; expires_at: string }> {
    return this.request<{ id: string; expires_at: string }>("POST", `/v1/files/${id}/extend`, {
      body: { expires_in },
    });
  }

  async createUploadRequest(opts: CreateUploadRequestOpts): Promise<UploadRequest> {
    return this.request<UploadRequest>("POST", "/v1/upload-requests", { body: opts });
  }

  async getUploadRequest(id: string): Promise<UploadRequestWithFile> {
    return this.request<UploadRequestWithFile>("GET", `/v1/upload-requests/${id}`);
  }

  async listRunArtifacts(run_id: string): Promise<RunManifest> {
    return this.request<RunManifest>("GET", `/v1/runs/${run_id}`);
  }
}
