// @omnilith/runtime
// Policy evaluation and effect execution

// Runtime loop (the heartbeat - observation → policies → effects)
export {
  processObservation,
  processObservations,
  isProcessingError,
  type ProcessObservationOptions,
  type ProcessObservationResult,
  type PolicyExecutionSummary,
} from './loop.js';

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
  EffectExecutionError,
  UnknownEffectError,
  EntityNotFoundError,
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

// Effect execution
export {
  // Types
  type EffectExecutionContext,
  type EffectExecutionResult,
  type EffectsExecutionResult,
  type EffectHandler,
  type EffectLogger,
  type LogEntry,
  type ExecuteEffectsOptions,
  // Loggers
  consoleLogger,
  silentLogger,
  createCapturingLogger,
  // Registry
  effectRegistry,
  isPackEffect,
  parsePackEffect,
  packEffectType,
  // Handlers
  routeObservationHandler,
  createEntityEventHandler,
  proposeActionHandler,
  tagObservationHandler,
  suppressHandler,
  logHandler,
  builtInHandlers,
  // Executor
  executeEffect,
  executeEffects,
  createExecutionContext,
  registerEffectHandler,
  unregisterEffectHandler,
  hasEffectHandler,
  getRegisteredEffectTypes,
} from './effects/index.js';
