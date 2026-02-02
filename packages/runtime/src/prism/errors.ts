// Prism Error Types

import type { PrismOperationType, PrismResourceType } from '@omnilith/protocol';

/**
 * Base error class for all Prism errors.
 */
export class PrismError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'PrismError';
    this.code = code;
  }
}

/**
 * Error thrown when operation input validation fails.
 */
export class PrismValidationError extends PrismError {
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { field?: string; details?: Record<string, unknown> }
  ) {
    super(message, 'PRISM_VALIDATION_ERROR');
    this.name = 'PrismValidationError';
    this.field = options?.field;
    this.details = options?.details;
  }
}

/**
 * Error thrown when the actor lacks authorization for an operation.
 */
export class PrismAuthorizationError extends PrismError {
  readonly actorNodeId: string;
  readonly operationType: PrismOperationType;
  readonly resourceType: PrismResourceType;
  readonly resourceId?: string;

  constructor(
    message: string,
    options: {
      actorNodeId: string;
      operationType: PrismOperationType;
      resourceType: PrismResourceType;
      resourceId?: string;
    }
  ) {
    super(message, 'PRISM_AUTHORIZATION_ERROR');
    this.name = 'PrismAuthorizationError';
    this.actorNodeId = options.actorNodeId;
    this.operationType = options.operationType;
    this.resourceType = options.resourceType;
    this.resourceId = options.resourceId;
  }
}

/**
 * Error thrown when an operation fails during execution.
 */
export class PrismOperationError extends PrismError {
  readonly operationType: PrismOperationType;
  readonly resourceType: PrismResourceType;
  readonly resourceId?: string;
  readonly cause?: Error;

  constructor(
    message: string,
    options: {
      operationType: PrismOperationType;
      resourceType: PrismResourceType;
      resourceId?: string;
      cause?: Error;
    }
  ) {
    super(message, 'PRISM_OPERATION_ERROR');
    this.name = 'PrismOperationError';
    this.operationType = options.operationType;
    this.resourceType = options.resourceType;
    this.resourceId = options.resourceId;
    this.cause = options.cause;
  }
}
