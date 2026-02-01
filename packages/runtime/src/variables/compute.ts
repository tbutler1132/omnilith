// ComputeSpec evaluation - derives values from observations
//
// A ComputeSpec defines how to estimate a Variable from observations.
// This module implements the evaluation logic per spec §8.1.2.

import type {
  ComputeSpec,
  Observation,
  AggregationMethod,
} from '@omnilith/protocol';

/**
 * Result of evaluating a ComputeSpec against observations.
 */
export type ComputeResult = {
  /**
   * The computed value (may be undefined if no matching observations)
   */
  value: number | undefined;

  /**
   * Confidence in the computed value (0-1)
   * Combines spec confidence with observation coverage
   */
  confidence: number;

  /**
   * Number of observations that matched the filter
   */
  matchedCount: number;

  /**
   * Number of observations used in the computation (after window.count limit)
   */
  usedCount: number;

  /**
   * The observations that were used in the computation
   */
  usedObservations: Observation[];
};

/**
 * Error thrown when ComputeSpec evaluation fails.
 */
export class ComputeSpecError extends Error {
  readonly specId: string;
  readonly reason: string;

  constructor(specId: string, reason: string) {
    super(`ComputeSpec "${specId}" evaluation failed: ${reason}`);
    this.name = 'ComputeSpecError';
    this.specId = specId;
    this.reason = reason;
  }
}

/**
 * Check if an observation type matches a pattern.
 *
 * Per spec §8.1.2, patterns can be:
 * - Exact match: "health.sleep" matches only "health.sleep"
 * - Prefix with wildcard: "health.*" matches "health", "health.sleep", "health.exercise.morning"
 *
 * @param observationType - The observation's type string
 * @param pattern - The pattern to match against
 * @returns true if the type matches the pattern
 */
export function matchesObservationType(
  observationType: string,
  pattern: string
): boolean {
  // Exact match
  if (pattern === observationType) {
    return true;
  }

  // Prefix wildcard match (e.g., "health.*")
  // Matches "health" exactly, or any type starting with "health."
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2); // Remove ".*"
    return (
      observationType === prefix || observationType.startsWith(prefix + '.')
    );
  }

  // No implicit prefix matching - patterns must be exact or use wildcard
  return false;
}

/**
 * Filter observations by type patterns defined in a ComputeSpec.
 *
 * @param observations - All available observations
 * @param observationTypes - Type patterns to match
 * @returns Observations that match any of the type patterns
 */
export function filterByObservationTypes(
  observations: Observation[],
  observationTypes: string[]
): Observation[] {
  if (observationTypes.length === 0) {
    return [];
  }

  return observations.filter((obs) =>
    observationTypes.some((pattern) => matchesObservationType(obs.type, pattern))
  );
}

/**
 * Filter observations by time window.
 *
 * @param observations - Observations to filter
 * @param hours - Only include observations from the last N hours
 * @param referenceTime - Reference time for "now" (defaults to current time)
 * @returns Observations within the time window
 */
export function filterByTimeWindow(
  observations: Observation[],
  hours: number,
  referenceTime: Date = new Date()
): Observation[] {
  const cutoffTime = new Date(referenceTime.getTime() - hours * 60 * 60 * 1000);
  const cutoffIso = cutoffTime.toISOString();

  return observations.filter((obs) => obs.timestamp >= cutoffIso);
}

/**
 * Apply count limit to observations (takes the most recent N).
 *
 * Per spec §8.1.2: When both hours and count are specified,
 * the time filter is applied first, then the count limit.
 *
 * @param observations - Observations to limit (should be sorted by timestamp desc)
 * @param count - Maximum number of observations to use
 * @returns Up to `count` most recent observations
 */
export function applyCountLimit(
  observations: Observation[],
  count: number
): Observation[] {
  // Sort by timestamp descending (most recent first)
  const sorted = [...observations].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );

  return sorted.slice(0, count);
}

/**
 * Extract a numeric value from an observation payload.
 *
 * Supports:
 * - Direct number payload
 * - Object with 'value' field
 * - Object with 'amount' field
 * - Object with 'score' field
 *
 * @param payload - The observation payload
 * @returns The numeric value, or undefined if not extractable
 */
export function extractNumericValue(payload: unknown): number | undefined {
  // Direct number
  if (typeof payload === 'number') {
    return payload;
  }

  // Object with known value fields
  if (payload !== null && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;

    // Try common value field names
    for (const field of ['value', 'amount', 'score', 'hours', 'minutes', 'duration', 'count']) {
      if (typeof obj[field] === 'number') {
        return obj[field] as number;
      }
    }
  }

  return undefined;
}

/**
 * Aggregate numeric values using the specified method.
 *
 * @param values - Array of numeric values to aggregate
 * @param method - Aggregation method
 * @returns Aggregated value, or undefined if values is empty
 */
export function aggregate(
  values: number[],
  method: AggregationMethod
): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  switch (method) {
    case 'latest':
      // Values should be in chronological order (most recent last)
      // After sorting desc, the first value is the latest
      return values[0];

    case 'sum':
      return values.reduce((sum, v) => sum + v, 0);

    case 'avg':
      return values.reduce((sum, v) => sum + v, 0) / values.length;

    case 'count':
      return values.length;

    case 'min':
      return Math.min(...values);

    case 'max':
      return Math.max(...values);

    default: {
      // Exhaustive check
      const _exhaustive: never = method;
      throw new Error(`Unknown aggregation method: ${_exhaustive}`);
    }
  }
}

/**
 * Evaluate a ComputeSpec against a set of observations.
 *
 * This is the core function that derives a value from observations
 * according to the spec's filtering and aggregation rules.
 *
 * Per spec §8.1.2:
 * - Filter observations by type patterns
 * - Apply time window filter (if specified)
 * - Apply count limit (if specified, after time filter)
 * - Aggregate using the specified method
 *
 * @param spec - The ComputeSpec to evaluate
 * @param observations - Available observations (should be for the relevant node)
 * @param referenceTime - Reference time for window calculations (defaults to now)
 * @returns ComputeResult with value, confidence, and metadata
 */
export function evaluateComputeSpec(
  spec: ComputeSpec,
  observations: Observation[],
  referenceTime: Date = new Date()
): ComputeResult {
  // Step 1: Filter by observation types
  let filtered = filterByObservationTypes(observations, spec.observationTypes);
  const matchedCount = filtered.length;

  // Step 2: Apply time window (if specified)
  if (spec.window?.hours !== undefined) {
    filtered = filterByTimeWindow(filtered, spec.window.hours, referenceTime);
  }

  // Step 3: Sort by timestamp descending (most recent first)
  filtered = [...filtered].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );

  // Step 4: Apply count limit (if specified)
  if (spec.window?.count !== undefined) {
    filtered = applyCountLimit(filtered, spec.window.count);
  }

  const usedCount = filtered.length;

  // Step 5: Extract numeric values
  const values: number[] = [];
  for (const obs of filtered) {
    const value = extractNumericValue(obs.payload);
    if (value !== undefined) {
      values.push(value);
    }
  }

  // Step 6: Aggregate
  // For 'count', we count all matched observations, not just those with numeric values
  let value: number | undefined;
  if (spec.aggregation === 'count') {
    value = usedCount;
  } else {
    value = aggregate(values, spec.aggregation);
  }

  // Step 7: Calculate confidence
  // Base confidence comes from the spec
  // We reduce confidence if we have fewer observations than expected
  let confidence = spec.confidence ?? 1.0;

  // Reduce confidence if no observations matched
  if (usedCount === 0) {
    confidence = 0;
  } else if (spec.window?.count !== undefined && usedCount < spec.window.count) {
    // Reduce confidence proportionally if we have fewer observations than the count limit
    const coverageRatio = usedCount / spec.window.count;
    confidence = confidence * (0.5 + 0.5 * coverageRatio);
  }

  // Reduce confidence if aggregating non-count and we couldn't extract values
  if (spec.aggregation !== 'count' && values.length < usedCount) {
    const extractionRatio = values.length / usedCount;
    confidence = confidence * extractionRatio;
  }

  return {
    value,
    confidence,
    matchedCount,
    usedCount,
    usedObservations: filtered,
  };
}

/**
 * Evaluate multiple ComputeSpecs and combine their results.
 *
 * When a Variable has multiple ComputeSpecs, this function evaluates
 * all of them and returns the result with the highest confidence.
 *
 * @param specs - Array of ComputeSpecs to evaluate
 * @param observations - Available observations
 * @param referenceTime - Reference time for window calculations
 * @returns The result with highest confidence, or undefined result if all fail
 */
export function evaluateComputeSpecs(
  specs: ComputeSpec[],
  observations: Observation[],
  referenceTime: Date = new Date()
): ComputeResult {
  if (specs.length === 0) {
    return {
      value: undefined,
      confidence: 0,
      matchedCount: 0,
      usedCount: 0,
      usedObservations: [],
    };
  }

  const results = specs.map((spec) =>
    evaluateComputeSpec(spec, observations, referenceTime)
  );

  // Return the result with highest confidence that has a value
  const resultsWithValue = results.filter((r) => r.value !== undefined);

  if (resultsWithValue.length === 0) {
    // No specs produced a value - return the one with most matched observations
    return results.reduce((best, current) =>
      current.matchedCount > best.matchedCount ? current : best
    );
  }

  return resultsWithValue.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );
}
