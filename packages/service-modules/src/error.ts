export enum ServiceModuleErrorCode {
  NoQueryReturnValue = 'COMMON.NO_QUERY_RETURN_VALUE',
  SearchParamsInvalid = 'COMMON.SEARCH_PARAM_INVALID',
  NotificationValidationFailed = 'NOTIFICATION.VALIDATION_FAILED',
  NotificationNotFound = 'NOTIFICATION.NOT_FOUND',
  UserNotFound = 'USER.NOT_FOUND',
}

/**
 * A custom error class thrown by service modules for various reasons.
 * The class itself holds additional information about the error like a unique
 * `code` used to identify the type of issue or additional `metadata` containing
 * any type of content.
 */
export class ServiceModuleError extends Error {
  public readonly code: ServiceModuleErrorCode;
  public readonly metadata: Record<string, unknown>;

  constructor(message: string, code: ServiceModuleErrorCode, metadata: Record<string, unknown> = {}) {
    super(message);

    this.code = code;
    this.metadata = metadata;
  }
}
