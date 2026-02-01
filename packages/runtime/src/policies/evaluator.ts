// Policy evaluation engine - runs policies against observations and returns effects

import type { Policy, PolicyContext, Effect, Observation, Id } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import { PolicyExecutionError, PolicyTimeoutError } from '../errors.js';
import { getCompiledPolicy } from './compiler.js';
import { buildPolicyContext } from './context.js';

/**
 * Default timeout for policy execution in milliseconds
 */
const DEFAULT_POLICY_TIMEOUT_MS = 5000;

/**
 * Options for policy evaluation
 */
export type EvaluatePolicyOptions = {
  /**
   * Timeout for policy execution in milliseconds (default: 5000)
   */
  timeoutMs?: number;

  /**
   * Effects from higher-priority policies (for accumulation)
   */
  priorEffects?: Effect[];

  /**
   * Override the evaluation timestamp
   */
  evaluatedAt?: string;
};

/**
 * Result of evaluating a single policy
 */
export type PolicyEvaluationResult = {
  /**
   * The policy that was evaluated
   */
  policy: Policy;

  /**
   * Effects produced by this policy
   */
  effects: Effect[];

  /**
   * Whether the policy returned a suppress effect
   */
  suppressed: boolean;

  /**
   * Reason if suppressed
   */
  suppressReason?: string;

  /**
   * Time taken to evaluate in milliseconds
   */
  durationMs: number;

  /**
   * Error if evaluation failed (policy still returns empty effects on error)
   */
  error?: PolicyExecutionError;
};

/**
 * Result of evaluating multiple policies
 */
export type PoliciesEvaluationResult = {
  /**
   * All effects from all policies (accumulated)
   */
  effects: Effect[];

  /**
   * Results from each policy in evaluation order
   */
  policyResults: PolicyEvaluationResult[];

  /**
   * Whether evaluation was stopped early due to suppress
   */
  suppressed: boolean;

  /**
   * Suppress reason if stopped early
   */
  suppressReason?: string;

  /**
   * Policy that triggered suppression
   */
  suppressedByPolicyId?: Id;

  /**
   * Total duration in milliseconds
   */
  totalDurationMs: number;
};

/**
 * Execute a policy evaluator function with timeout protection.
 *
 * @param evaluator - The compiled policy function
 * @param ctx - The policy context
 * @param policy - The policy (for error reporting)
 * @param timeoutMs - Maximum execution time
 * @returns Effects from the policy
 */
async function executeWithTimeout(
  evaluator: (ctx: PolicyContext) => Effect[],
  ctx: PolicyContext,
  policy: Policy,
  timeoutMs: number
): Promise<Effect[]> {
  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      reject(new PolicyTimeoutError(policy.id, policy.name, timeoutMs));
    }, timeoutMs);

    try {
      // Execute synchronously (policies should be fast)
      const effects = evaluator(ctx);
      clearTimeout(timeoutId);
      resolve(effects);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Evaluate a single policy against an observation.
 *
 * This function:
 * 1. Builds the PolicyContext with the observation and node state
 * 2. Compiles the policy code (cached)
 * 3. Executes the policy with timeout protection
 * 4. Returns the effects produced
 *
 * On error, the policy returns empty effects and the error is included in the result.
 * This ensures one failing policy doesn't break the entire evaluation chain.
 *
 * @param repos - Repository context for data access
 * @param policy - The policy to evaluate
 * @param observation - The triggering observation
 * @param options - Evaluation options
 * @returns The evaluation result including effects and metadata
 */
export async function evaluatePolicy(
  repos: RepositoryContext,
  policy: Policy,
  observation: Observation,
  options: EvaluatePolicyOptions = {}
): Promise<PolicyEvaluationResult> {
  const { timeoutMs = DEFAULT_POLICY_TIMEOUT_MS, priorEffects = [], evaluatedAt } = options;
  const startTime = Date.now();

  // Skip disabled policies
  if (!policy.enabled) {
    return {
      policy,
      effects: [],
      suppressed: false,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Build the context
    const ctx = await buildPolicyContext(repos, observation, policy, {
      priorEffects,
      evaluatedAt,
    });

    // Get compiled evaluator
    const evaluator = getCompiledPolicy(policy);

    // Execute with timeout
    const effects = await executeWithTimeout(evaluator, ctx, policy, timeoutMs);

    // Check for suppress effect
    const suppressEffect = effects.find((e) => e.effect === 'suppress');
    const suppressed = !!suppressEffect;
    const suppressReason = suppressed ? (suppressEffect as { reason: string }).reason : undefined;

    return {
      policy,
      effects,
      suppressed,
      suppressReason,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    // Wrap errors in PolicyExecutionError
    const execError =
      error instanceof PolicyExecutionError
        ? error
        : new PolicyExecutionError(
            policy.id,
            policy.name,
            error instanceof Error ? error.message : String(error),
            error instanceof Error ? error : undefined
          );

    // Return empty effects on error - don't break the chain
    return {
      policy,
      effects: [],
      suppressed: false,
      durationMs: Date.now() - startTime,
      error: execError,
    };
  }
}

/**
 * Evaluate multiple policies in priority order.
 *
 * This function:
 * 1. Sorts policies by priority (lower = higher priority)
 * 2. Evaluates each policy in order
 * 3. Accumulates effects (later policies see earlier effects via priorEffects)
 * 4. Stops evaluation if a suppress effect is encountered
 *
 * @param repos - Repository context for data access
 * @param policies - Policies to evaluate (will be sorted by priority)
 * @param observation - The triggering observation
 * @param options - Evaluation options
 * @returns Combined evaluation result
 */
export async function evaluatePolicies(
  repos: RepositoryContext,
  policies: Policy[],
  observation: Observation,
  options: Omit<EvaluatePolicyOptions, 'priorEffects'> = {}
): Promise<PoliciesEvaluationResult> {
  const startTime = Date.now();
  const { timeoutMs, evaluatedAt } = options;

  // Sort by priority (lower number = higher priority)
  const sortedPolicies = [...policies].sort((a, b) => a.priority - b.priority);

  const policyResults: PolicyEvaluationResult[] = [];
  const accumulatedEffects: Effect[] = [];
  let suppressed = false;
  let suppressReason: string | undefined;
  let suppressedByPolicyId: Id | undefined;

  for (const policy of sortedPolicies) {
    // Evaluate with accumulated prior effects
    const result = await evaluatePolicy(repos, policy, observation, {
      timeoutMs,
      evaluatedAt,
      priorEffects: [...accumulatedEffects],
    });

    policyResults.push(result);

    // Accumulate effects
    accumulatedEffects.push(...result.effects);

    // Check for suppression
    if (result.suppressed) {
      suppressed = true;
      suppressReason = result.suppressReason;
      suppressedByPolicyId = policy.id;
      break; // Stop evaluating further policies
    }
  }

  return {
    effects: accumulatedEffects,
    policyResults,
    suppressed,
    suppressReason,
    suppressedByPolicyId,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Check if an observation type matches a trigger pattern.
 *
 * Supports:
 * - Exact match: "health.sleep" matches "health.sleep"
 * - Wildcard suffix: "health.*" matches "health.sleep", "health.exercise"
 * - Full wildcard: "*" matches everything
 *
 * @param observationType - The observation type to check
 * @param triggerPattern - The trigger pattern from the policy
 * @returns True if the observation type matches the pattern
 */
export function matchesTrigger(observationType: string, triggerPattern: string): boolean {
  // Full wildcard matches everything
  if (triggerPattern === '*') {
    return true;
  }

  // Exact match
  if (observationType === triggerPattern) {
    return true;
  }

  // Wildcard suffix (e.g., "health.*" matches "health.sleep")
  if (triggerPattern.endsWith('.*')) {
    const prefix = triggerPattern.slice(0, -2);
    return observationType === prefix || observationType.startsWith(prefix + '.');
  }

  return false;
}

/**
 * Filter policies by trigger match for an observation.
 *
 * @param policies - All policies to filter
 * @param observationType - The observation type to match against
 * @returns Policies whose triggers match the observation type
 */
export function filterPoliciesByTrigger(policies: Policy[], observationType: string): Policy[] {
  return policies.filter(
    (policy) =>
      policy.enabled && policy.triggers.some((trigger) => matchesTrigger(observationType, trigger))
  );
}

/**
 * Get and evaluate matching policies for an observation.
 *
 * This is a convenience function that:
 * 1. Gets policies for the node via repository
 * 2. Filters to matching triggers
 * 3. Evaluates in priority order
 *
 * @param repos - Repository context
 * @param observation - The triggering observation
 * @param options - Evaluation options
 * @returns Evaluation result
 */
export async function evaluatePoliciesForObservation(
  repos: RepositoryContext,
  observation: Observation,
  options: Omit<EvaluatePolicyOptions, 'priorEffects'> = {}
): Promise<PoliciesEvaluationResult> {
  // Get matching policies from repository
  // The repository should handle trigger matching, but we filter as a safeguard
  const matchingPolicies = await repos.policies.getByTrigger(
    observation.nodeId,
    observation.type
  );

  // Evaluate all matching policies
  return evaluatePolicies(repos, matchingPolicies, observation, options);
}
