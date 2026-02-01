// Runtime error types

/**
 * Base class for all runtime errors.
 * Provides structured error information for debugging and logging.
 */
export class RuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
  }
}

/**
 * Validation error for malformed or invalid input.
 */
export class ValidationError extends RuntimeError {
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { field?: string; details?: Record<string, unknown> }
  ) {
    super('VALIDATION_ERROR', message);
    this.name = 'ValidationError';
    this.field = options?.field;
    this.details = options?.details;
  }
}

/**
 * Error for missing required provenance information.
 */
export class ProvenanceError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, { field });
    this.name = 'ProvenanceError';
  }
}

/**
 * Error when a referenced node does not exist.
 */
export class NodeNotFoundError extends RuntimeError {
  readonly nodeId: string;

  constructor(nodeId: string) {
    super('NODE_NOT_FOUND', `Node not found: ${nodeId}`);
    this.name = 'NodeNotFoundError';
    this.nodeId = nodeId;
  }
}

/**
 * Error when observation type format is invalid.
 */
export class InvalidObservationTypeError extends ValidationError {
  readonly observationType: string;

  constructor(observationType: string, reason: string) {
    super(`Invalid observation type "${observationType}": ${reason}`, {
      field: 'type',
      details: { observationType, reason },
    });
    this.name = 'InvalidObservationTypeError';
    this.observationType = observationType;
  }
}
