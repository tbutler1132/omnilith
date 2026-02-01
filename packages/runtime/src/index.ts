// @omnilith/runtime
// Policy evaluation and effect execution

// Error types
export {
  RuntimeError,
  ValidationError,
  ProvenanceError,
  NodeNotFoundError,
  InvalidObservationTypeError,
  PolicyCompilationError,
  PolicyExecutionError,
  PolicyTimeoutError,
  InvalidEffectError,
} from './errors.js';

// Ingestion
export {
  ingestObservation,
  ingestObservations,
  type IngestObservationInput,
  type IngestObservationResult,
  type IngestObservationOptions,
} from './ingestion/index.js';

// Policy evaluation
export {
  // Context building
  buildPolicyContext,
  createCanonAccessor,
  createEstimatesAccessor,
  type BuildPolicyContextOptions,
  // Compilation
  compilePolicy,
  getCompiledPolicy,
  clearCompiledPolicyCache,
  // Evaluation
  evaluatePolicy,
  evaluatePolicies,
  evaluatePoliciesForObservation,
  matchesTrigger,
  filterPoliciesByTrigger,
  type EvaluatePolicyOptions,
  type PolicyEvaluationResult,
  type PoliciesEvaluationResult,
} from './policies/index.js';
