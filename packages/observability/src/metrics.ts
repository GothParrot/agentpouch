export type MetricsSnapshot = {
  ingest_count: number;
  serve_count: number;
  upload_request_count: number;
  error_count: number;
  errors_by_route: Record<string, number>;
  bytes_uploaded: number;
  bytes_served: number;
};

export class MetricsStore {
  private _ingestCount = 0;
  private _serveCount = 0;
  private _uploadRequestCount = 0;
  private _errorsByRoute: Map<string, number> = new Map();
  private _bytesUploaded = 0;
  private _bytesServed = 0;

  incrementIngest(): void {
    this._ingestCount++;
  }
  incrementServe(): void {
    this._serveCount++;
  }
  incrementUploadRequest(): void {
    this._uploadRequestCount++;
  }
  incrementError(route: string): void {
    this._errorsByRoute.set(route, (this._errorsByRoute.get(route) ?? 0) + 1);
  }
  addBytesUploaded(n: number): void {
    this._bytesUploaded += n;
  }
  addBytesServed(n: number): void {
    this._bytesServed += n;
  }

  snapshot(): MetricsSnapshot {
    const errors_by_route: Record<string, number> = {};
    let error_count = 0;
    for (const [k, v] of this._errorsByRoute) {
      errors_by_route[k] = v;
      error_count += v;
    }
    return {
      ingest_count: this._ingestCount,
      serve_count: this._serveCount,
      upload_request_count: this._uploadRequestCount,
      error_count,
      errors_by_route,
      bytes_uploaded: this._bytesUploaded,
      bytes_served: this._bytesServed,
    };
  }

  toPrometheus(): string {
    const s = this.snapshot();
    const lines = [
      `# HELP agentbox_ingest_total Total files ingested`,
      `# TYPE agentbox_ingest_total counter`,
      `agentbox_ingest_total ${s.ingest_count}`,
      `# HELP agentbox_serve_total Total files served`,
      `# TYPE agentbox_serve_total counter`,
      `agentbox_serve_total ${s.serve_count}`,
      `# HELP agentbox_upload_request_total Total upload requests created`,
      `# TYPE agentbox_upload_request_total counter`,
      `agentbox_upload_request_total ${s.upload_request_count}`,
      `# HELP agentbox_errors_total Total errors by route`,
      `# TYPE agentbox_errors_total counter`,
      ...Object.entries(s.errors_by_route).map(
        ([route, count]) => `agentbox_errors_total{route="${route}"} ${count}`,
      ),
      `# HELP agentbox_bytes_uploaded_total Total bytes uploaded`,
      `# TYPE agentbox_bytes_uploaded_total counter`,
      `agentbox_bytes_uploaded_total ${s.bytes_uploaded}`,
      `# HELP agentbox_bytes_served_total Total bytes served`,
      `# TYPE agentbox_bytes_served_total counter`,
      `agentbox_bytes_served_total ${s.bytes_served}`,
    ];
    return lines.join("\n") + "\n";
  }
}
