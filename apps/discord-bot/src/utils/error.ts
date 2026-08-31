/** Custom error class thrown by different logic and caught by a global error. */
export class ServiceError extends Error {
  public readonly metadata: Record<string, unknown>;

  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message);

    this.metadata = metadata;
  }
}
