export type QueueJob<T> = {
  id: string;
  payload: T;
  attemptNumber: number;
};

export type QueueHandler<T> = (job: QueueJob<T>) => Promise<void>;

export interface Queue<T = unknown> {
  enqueue(payload: T): Promise<void>;
  consume(handler: QueueHandler<T>): void;
}

/** Runs the handler synchronously in-process. No retries, no persistence. */
export class InlineQueue<T = unknown> implements Queue<T> {
  private handler: QueueHandler<T> | null = null;

  async enqueue(payload: T): Promise<void> {
    if (!this.handler) return;
    await this.handler({ id: crypto.randomUUID(), payload, attemptNumber: 1 });
  }

  consume(handler: QueueHandler<T>): void {
    this.handler = handler;
  }
}
