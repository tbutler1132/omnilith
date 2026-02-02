// Observation Log Replay
//
// Replays observations through the policy engine to reconstruct derived state.
// Per spec §0.5:
// - Replay re-evaluates decisions, not the external world
// - Policies are re-run deterministically against historical context
// - Effects are re-derived
// - External ActionRuns are NOT re-executed during replay
// - The recorded inputs, outputs, and audits of ActionRuns are treated as historical facts

import type { Observation, Effect, ActionRun, Id } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  evaluatePoliciesForObservation,
  type PoliciesEvaluationResult,
} from '../policies/index.js';
import { executeEffects, type EffectLogger, silentLogger } from '../effects/index.js';

/**
 * Mode for replay operation
 */
export type ReplayMode =
  | 'evaluate_only' // Only evaluate policies, don't execute effects
  | 'execute_internal' // Execute internal effects, skip external (ActionRuns use recorded results)
  | 'full'; // Full replay including effect execution (still skips ActionRun re-execution)

/**
 * Options for replaying a single observation
 */
export type ReplayObservationOptions = {
  /**
   * Replay mode (default: 'evaluate_only')
   */
  mode?: ReplayMode;

  /**
   * Historical ActionRuns to use instead of re-executing.
   * Keyed by proposedBy.observationId for lookup.
   */
  historicalActionRuns?: Map<Id, ActionRun[]>;

  /**
   * Override the evaluation timestamp for deterministic replay.
   * If not provided, uses the observation's timestamp.
   */
  evaluatedAt?: string;

  /**
   * Timeout for policy execution in milliseconds (default: 5000)
   */
  policyTimeoutMs?: number;

  /**
   * Logger for effect execution (default: silent)
   */
  logger?: EffectLogger;
};

/**
 * Result of replaying a single observation
 */
export type ReplayObservationResult = {
  /**
   * The observation that was replayed
   */
  observation: Observation;

  /**
   * Results of policy evaluation
   */
  evaluation: PoliciesEvaluationResult;

  /**
   * Effects that were produced
   */
  effects: Effect[];

  /**
   * Effects that were executed (empty if mode is 'evaluate_only')
   */
  executedEffects: Effect[];

  /**
   * Effects that were skipped (e.g., propose_action in replay mode)
   */
  skippedEffects: Effect[];

  /**
   * Historical ActionRuns that were used instead of creating new ones
   */
  usedHistoricalActionRuns: ActionRun[];

  /**
   * Time taken to replay in milliseconds
   */
  durationMs: number;
};

/**
 * Options for replaying the full observation log
 */
export type ReplayLogOptions = ReplayObservationOptions & {
  /**
   * Progress callback for long replays
   */
  onProgress?: (current: number, total: number) => void;

  /**
   * Whether to continue on error (default: true)
   */
  continueOnError?: boolean;

  /**
   * Maximum observations to replay (for testing/debugging)
   */
  limit?: number;
};

/**
 * Result of replaying the full observation log
 */
export type ReplayLogResult = {
  /**
   * Total observations replayed
   */
  totalObservations: number;

  /**
   * Successful replays
   */
  successCount: number;

  /**
   * Failed replays
   */
  failureCount: number;

  /**
   * Total effects produced
   */
  totalEffects: number;

  /**
   * Total effects executed
   */
  totalExecutedEffects: number;

  /**
   * Results for each observation (in order)
   */
  results: Array<ReplayObservationResult | { error: Error; observation: Observation }>;

  /**
   * Total replay duration in milliseconds
   */
  totalDurationMs: number;
};

/**
 * Replay a single observation through the policy engine.
 *
 * This function re-evaluates policies against the observation and optionally
 * executes the resulting effects. ActionRuns are not re-executed - historical
 * results are used instead.
 *
 * @param repos - Repository context
 * @param observation - The observation to replay
 * @param options - Replay options
 * @returns Replay result with effects and metadata
 */
export async function replayObservation(
  repos: RepositoryContext,
  observation: Observation,
  options: ReplayObservationOptions = {}
): Promise<ReplayObservationResult> {
  const startTime = Date.now();
  const {
    mode = 'evaluate_only',
    historicalActionRuns = new Map(),
    evaluatedAt = observation.timestamp,
    policyTimeoutMs,
    logger = silentLogger,
  } = options;

  // Phase 1: Evaluate policies with historical timestamp
  const evaluation = await evaluatePoliciesForObservation(repos, observation, {
    timeoutMs: policyTimeoutMs,
    evaluatedAt,
  });

  const effects = evaluation.effects;
  const executedEffects: Effect[] = [];
  const skippedEffects: Effect[] = [];
  const usedHistoricalActionRuns: ActionRun[] = [];

  // Phase 2: Handle effects based on mode
  if (mode !== 'evaluate_only') {
    for (const effect of effects) {
      // Handle propose_action specially - use historical results, don't re-execute
      if (effect.effect === 'propose_action') {
        const historicalRuns = historicalActionRuns.get(observation.id) ?? [];
        if (historicalRuns.length > 0) {
          usedHistoricalActionRuns.push(...historicalRuns);
        }
        skippedEffects.push(effect);
        continue;
      }

      // In 'execute_internal' mode, execute non-external effects
      if (mode === 'execute_internal' || mode === 'full') {
        // Find the first policy that produced effects for attribution
        const producingPolicy = evaluation.policyResults.find(
          (pr) => pr.effects.length > 0
        );
        const policyId = producingPolicy?.policy.id ?? 'replay';

        await executeEffects([effect], repos, observation, policyId, {
          logger,
          continueOnError: true,
        });
        executedEffects.push(effect);
      }
    }
  }

  return {
    observation,
    evaluation,
    effects,
    executedEffects,
    skippedEffects,
    usedHistoricalActionRuns,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Replay the full observation log.
 *
 * This function replays observations in timestamp order, re-evaluating policies
 * and optionally executing effects. ActionRuns use their recorded results - they
 * are NOT re-executed.
 *
 * Per spec §0.5: "Replay re-evaluates decisions, not the external world."
 *
 * @param repos - Repository context
 * @param observations - Observations to replay (should be sorted by timestamp)
 * @param options - Replay options
 * @returns Summary of the replay operation
 *
 * @example
 * ```typescript
 * // Load observations from bundle
 * const observations = await loadObservationsFromBundle(bundlePath);
 *
 * // Get historical ActionRuns
 * const actionRuns = await loadActionRunsFromBundle(bundlePath);
 * const actionRunMap = groupActionRunsByObservation(actionRuns);
 *
 * // Replay in evaluate-only mode to verify determinism
 * const result = await replayObservationLog(repos, observations, {
 *   mode: 'evaluate_only',
 *   historicalActionRuns: actionRunMap,
 * });
 *
 * console.log(`Replayed ${result.totalObservations} observations`);
 * console.log(`Total effects derived: ${result.totalEffects}`);
 * ```
 */
export async function replayObservationLog(
  repos: RepositoryContext,
  observations: Observation[],
  options: ReplayLogOptions = {}
): Promise<ReplayLogResult> {
  const startTime = Date.now();
  const { onProgress, continueOnError = true, limit } = options;

  // Apply limit if specified
  const toReplay = limit ? observations.slice(0, limit) : observations;

  const results: Array<ReplayObservationResult | { error: Error; observation: Observation }> = [];
  let successCount = 0;
  let failureCount = 0;
  let totalEffects = 0;
  let totalExecutedEffects = 0;

  for (let i = 0; i < toReplay.length; i++) {
    const observation = toReplay[i];

    if (onProgress) {
      onProgress(i + 1, toReplay.length);
    }

    try {
      const result = await replayObservation(repos, observation, options);
      results.push(result);
      successCount++;
      totalEffects += result.effects.length;
      totalExecutedEffects += result.executedEffects.length;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      results.push({ error: err, observation });
      failureCount++;

      if (!continueOnError) {
        break;
      }
    }
  }

  return {
    totalObservations: toReplay.length,
    successCount,
    failureCount,
    totalEffects,
    totalExecutedEffects,
    results,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Type guard for checking if a result is an error
 */
export function isReplayError(
  result: ReplayObservationResult | { error: Error; observation: Observation }
): result is { error: Error; observation: Observation } {
  return 'error' in result;
}

/**
 * Group ActionRuns by their triggering observation ID.
 * Useful for building the historicalActionRuns map.
 *
 * @param actionRuns - ActionRuns to group
 * @returns Map of observation ID to ActionRuns
 */
export function groupActionRunsByObservation(actionRuns: ActionRun[]): Map<Id, ActionRun[]> {
  const map = new Map<Id, ActionRun[]>();

  for (const run of actionRuns) {
    const obsId = run.proposedBy.observationId;
    const existing = map.get(obsId) ?? [];
    existing.push(run);
    map.set(obsId, existing);
  }

  return map;
}
