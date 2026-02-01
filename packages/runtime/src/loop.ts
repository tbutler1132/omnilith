// Runtime loop - ties observation ingestion, policy evaluation, and effect execution together
//
// This is the heartbeat of the system: observation comes in → policies evaluate it → effects execute.

import type { Observation, Id } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  ingestObservation,
  type IngestObservationInput,
  type IngestObservationOptions,
} from './ingestion/index.js';
import {
  evaluatePoliciesForObservation,
  type PolicyEvaluationResult,
} from './policies/index.js';
import {
  executeEffects,
  type EffectExecutionResult,
  type EffectLogger,
  consoleLogger,
} from './effects/index.js';

/**
 * Options for processing an observation
 */
export type ProcessObservationOptions = {
  /**
   * Whether to validate that nodes exist (default: true)
   */
  validateNode?: boolean;

  /**
   * Whether to validate the source node exists (default: true)
   */
  validateSource?: boolean;

  /**
   * Timeout for each policy evaluation in milliseconds (default: 5000)
   */
  policyTimeoutMs?: number;

  /**
   * Logger for effect execution (default: console)
   */
  logger?: EffectLogger;

  /**
   * Whether to continue executing effects after an error (default: true)
   */
  continueOnError?: boolean;

  /**
   * Whether to skip effect execution entirely (evaluation only)
   */
  skipExecution?: boolean;
};

/**
 * Summary of a single policy's contribution to the loop
 */
export type PolicyExecutionSummary = {
  policyId: Id;
  policyName: string;
  effectsProduced: number;
  effectsExecuted: number;
  effectsSucceeded: number;
  effectsFailed: number;
  evaluationDurationMs: number;
  executionDurationMs: number;
  error?: string;
};

/**
 * Result of processing an observation through the full loop
 */
export type ProcessObservationResult = {
  /**
   * The ingested observation
   */
  observation: Observation;

  /**
   * Summary of policy evaluation
   */
  evaluation: {
    /**
     * Number of policies that matched and were evaluated
     */
    policiesEvaluated: number;

    /**
     * Total effects produced by all policies
     */
    totalEffects: number;

    /**
     * Whether evaluation was stopped by a suppress effect
     */
    suppressed: boolean;

    /**
     * Reason for suppression if applicable
     */
    suppressReason?: string;

    /**
     * Policy that triggered suppression
     */
    suppressedByPolicyId?: Id;

    /**
     * Time spent evaluating policies
     */
    durationMs: number;

    /**
     * Per-policy evaluation details
     */
    policyResults: PolicyEvaluationResult[];
  };

  /**
   * Summary of effect execution
   */
  execution: {
    /**
     * Total effects executed
     */
    totalExecuted: number;

    /**
     * Successful effect executions
     */
    successCount: number;

    /**
     * Failed effect executions
     */
    failureCount: number;

    /**
     * Time spent executing effects
     */
    durationMs: number;

    /**
     * Per-policy execution summaries
     */
    perPolicy: PolicyExecutionSummary[];

    /**
     * Whether execution was skipped
     */
    skipped: boolean;
  };

  /**
   * Total time for the entire loop
   */
  totalDurationMs: number;
};

/**
 * Process an observation through the full runtime loop.
 *
 * This function orchestrates:
 * 1. Observation ingestion (validation, persistence)
 * 2. Policy evaluation (find matching policies, evaluate in priority order)
 * 3. Effect execution (execute effects per-policy for attribution)
 *
 * The loop is fault-tolerant:
 * - Policy errors don't stop evaluation of other policies
 * - Effect errors (by default) don't stop execution of other effects
 * - Suppress effects stop policy evaluation but allow effect execution of prior effects
 *
 * @param repos - Repository context for data access
 * @param input - The observation to process
 * @param options - Processing options
 * @returns Summary of what happened
 *
 * @example
 * ```typescript
 * const result = await processObservation(repos, {
 *   nodeId: 'node-123',
 *   type: 'finance.transaction',
 *   payload: { amount: -42.50, merchant: 'Whole Foods' },
 *   provenance: { sourceId: 'node-123', method: 'csv_import' },
 * });
 *
 * console.log(`Processed: ${result.evaluation.policiesEvaluated} policies, ${result.execution.successCount} effects`);
 * ```
 */
export async function processObservation(
  repos: RepositoryContext,
  input: IngestObservationInput,
  options: ProcessObservationOptions = {}
): Promise<ProcessObservationResult> {
  const startTime = Date.now();
  const {
    validateNode = true,
    validateSource = true,
    policyTimeoutMs,
    logger = consoleLogger,
    continueOnError = true,
    skipExecution = false,
  } = options;

  // Phase 1: Ingest the observation
  const ingestionOptions: IngestObservationOptions = {
    validateNode,
    validateSource,
  };
  const { observation } = await ingestObservation(repos, input, ingestionOptions);

  // Phase 2: Evaluate policies
  const evalResult = await evaluatePoliciesForObservation(repos, observation, {
    timeoutMs: policyTimeoutMs,
  });

  // Phase 3: Execute effects (per-policy for attribution)
  const perPolicySummaries: PolicyExecutionSummary[] = [];
  const allEffectResults: EffectExecutionResult[] = [];
  let totalExecutionDurationMs = 0;

  if (!skipExecution) {
    for (const policyResult of evalResult.policyResults) {
      const execStartTime = Date.now();

      // Skip policies that produced no effects
      if (policyResult.effects.length === 0) {
        perPolicySummaries.push({
          policyId: policyResult.policy.id,
          policyName: policyResult.policy.name,
          effectsProduced: 0,
          effectsExecuted: 0,
          effectsSucceeded: 0,
          effectsFailed: 0,
          evaluationDurationMs: policyResult.durationMs,
          executionDurationMs: 0,
          error: policyResult.error?.message,
        });
        continue;
      }

      // Execute effects from this policy
      const execResult = await executeEffects(
        policyResult.effects,
        repos,
        observation,
        policyResult.policy.id,
        {
          logger,
          continueOnError,
        }
      );

      const execDurationMs = Date.now() - execStartTime;
      totalExecutionDurationMs += execDurationMs;
      allEffectResults.push(...execResult.results);

      perPolicySummaries.push({
        policyId: policyResult.policy.id,
        policyName: policyResult.policy.name,
        effectsProduced: policyResult.effects.length,
        effectsExecuted: execResult.results.length,
        effectsSucceeded: execResult.successCount,
        effectsFailed: execResult.failureCount,
        evaluationDurationMs: policyResult.durationMs,
        executionDurationMs: execDurationMs,
        error: policyResult.error?.message,
      });
    }
  } else {
    // Execution skipped - still record policy summaries without execution
    for (const policyResult of evalResult.policyResults) {
      perPolicySummaries.push({
        policyId: policyResult.policy.id,
        policyName: policyResult.policy.name,
        effectsProduced: policyResult.effects.length,
        effectsExecuted: 0,
        effectsSucceeded: 0,
        effectsFailed: 0,
        evaluationDurationMs: policyResult.durationMs,
        executionDurationMs: 0,
        error: policyResult.error?.message,
      });
    }
  }

  // Build result
  const totalSuccessCount = allEffectResults.filter((r) => r.success).length;
  const totalFailureCount = allEffectResults.filter((r) => !r.success).length;

  return {
    observation,
    evaluation: {
      policiesEvaluated: evalResult.policyResults.length,
      totalEffects: evalResult.effects.length,
      suppressed: evalResult.suppressed,
      suppressReason: evalResult.suppressReason,
      suppressedByPolicyId: evalResult.suppressedByPolicyId,
      durationMs: evalResult.totalDurationMs,
      policyResults: evalResult.policyResults,
    },
    execution: {
      totalExecuted: allEffectResults.length,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
      durationMs: totalExecutionDurationMs,
      perPolicy: perPolicySummaries,
      skipped: skipExecution,
    },
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Process multiple observations in sequence.
 *
 * Each observation goes through the full loop independently.
 * Errors in one observation do not stop processing of subsequent observations.
 *
 * @param repos - Repository context
 * @param inputs - Observations to process
 * @param options - Processing options
 * @returns Results for each observation (in order)
 */
export async function processObservations(
  repos: RepositoryContext,
  inputs: IngestObservationInput[],
  options: ProcessObservationOptions = {}
): Promise<Array<ProcessObservationResult | { error: Error; input: IngestObservationInput }>> {
  const results: Array<ProcessObservationResult | { error: Error; input: IngestObservationInput }> =
    [];

  for (const input of inputs) {
    try {
      const result = await processObservation(repos, input, options);
      results.push(result);
    } catch (error) {
      results.push({
        error: error instanceof Error ? error : new Error(String(error)),
        input,
      });
    }
  }

  return results;
}

/**
 * Check if a result is an error result from batch processing.
 */
export function isProcessingError(
  result: ProcessObservationResult | { error: Error; input: IngestObservationInput }
): result is { error: Error; input: IngestObservationInput } {
  return 'error' in result;
}
