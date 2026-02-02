// Prism - The Commit Boundary
//
// Prism is the ONLY interface that mutates canon.
// All mutations flow through Prism which provides:
// - Transaction wrapping (all-or-nothing commits)
// - Audit logging (who changed what, when)
// - Authority validation (permission checks before mutation)
// - Provenance tracking (causality chain)

export {
  Prism,
  createPrism,
  type PrismOptions,
} from './prism.js';

export {
  // Error types
  PrismError,
  PrismValidationError,
  PrismAuthorizationError,
  PrismOperationError,
} from './errors.js';

export {
  // Audit store interface and implementation
  type AuditStore,
  createInMemoryAuditStore,
} from './audit.js';
