export type ScanResult = { clean: true } | { clean: false; reason: string };

export interface Scanner {
  scan(body: ReadableStream<Uint8Array>): Promise<ScanResult>;
}

export class NoopScanner implements Scanner {
  async scan(_body: ReadableStream<Uint8Array>): Promise<ScanResult> {
    return { clean: true };
  }
}
