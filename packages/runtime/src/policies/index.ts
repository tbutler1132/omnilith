// Policy evaluation exports

// Context building
export {
  buildPolicyContext,
  createCanonAccessor,
  createEstimatesAccessor,
  createEmptyEstimatesAccessor,
} from './context.js';
export type {
  BuildPolicyContextOptions,
  EstimatesAccessorData,
} from './context.js';

// Policy compilation
export { compilePolicy, getCompiledPolicy, clearCompiledPolicyCache } from './compiler.js';

// Policy evaluation
export {
  evaluatePolicy,
  evaluatePolicies,
  evaluatePoliciesForObservation,
  matchesTrigger,
  filterPoliciesByTrigger,
} from './evaluator.js';
export type {
  EvaluatePolicyOptions,
  PolicyEvaluationResult,
  PoliciesEvaluationResult,
} from './evaluator.js';
