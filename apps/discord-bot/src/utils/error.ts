/** Custom error class thrown by different logic and caught by a global error. */
export class ServiceError extends Error {
  public readonly metadata: Record<string, unknown>;

  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message);

    this.metadata = metadata;
  }
}

/**
 * Custom error class which can be thrown inside a multi-step command execution to
 * indicate it has either been cancelled by the user or timed out.
 */
export class MultiStepCommandCancelledError extends Error {
  constructor() {
    super('Multi-step command has been cancelled');
  }
}
