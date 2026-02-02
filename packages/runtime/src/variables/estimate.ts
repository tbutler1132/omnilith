// Variable Estimate Derivation
//
// Computes VariableEstimate from Variable + Observations.
// Estimates are derived (non-canon) and must be reproducible.

import type {
  Variable,
  VariableEstimate,
  ViableRange,
  Observation,
  Trend,
} from '@omnilith/protocol';
import { evaluateComputeSpecs } from './compute.js';

/**
 * Options for deriving a variable estimate
 */
export type DeriveEstimateOptions = {
  /**
   * Reference time for window calculations (defaults to now)
   */
  referenceTime?: Date;

  /**
   * Previous estimate for trend calculation
   */
  previousEstimate?: VariableEstimate;

  /**
   * Previous observations for trend calculation (alternative to previousEstimate)
   * Used to compute a previous value for comparison
   */
  previousObservations?: Observation[];

  /**
   * Time offset in hours for previous value calculation (default: 24)
   */
  trendWindowHours?: number;
};

/**
 * Check if a numeric value is within a range.
 *
 * @param value - The value to check
 * @param range - The range to check against
 * @returns true if value is within range bounds
 */
export function isInRange(value: number, range: ViableRange | undefined): boolean {
  if (!range) {
    return true; // No range defined = always in range
  }

  if (range.min !== undefined && value < range.min) {
    return false;
  }

  if (range.max !== undefined && value > range.max) {
    return false;
  }

  return true;
}

/**
 * Check if a numeric value is within the preferred (soft) bounds of a range.
 *
 * @param value - The value to check
 * @param range - The range to check against (uses softMin/softMax if defined, falls back to min/max)
 * @returns true if value is within preferred bounds
 */
export function isInPreferredBounds(value: number, range: ViableRange | undefined): boolean {
  if (!range) {
    return true; // No range defined = always preferred
  }

  const min = range.softMin ?? range.min;
  const max = range.softMax ?? range.max;

  if (min !== undefined && value < min) {
    return false;
  }

  if (max !== undefined && value > max) {
    return false;
  }

  return true;
}

/**
 * Calculate the center of a range.
 *
 * @param range - The range to find the center of
 * @returns The center value, or undefined if range has no bounds
 */
export function getRangeCenter(range: ViableRange | undefined): number | undefined {
  if (!range) {
    return undefined;
  }

  const min = range.softMin ?? range.min;
  const max = range.softMax ?? range.max;

  if (min !== undefined && max !== undefined) {
    return (min + max) / 2;
  }

  return min ?? max;
}

/**
 * Calculate deviation from preferred center.
 *
 * Per spec:
 * - 0 = at preferred center
 * - 0.5 = at viable boundary
 * - 1 = outside viable range
 *
 * @param value - The current value
 * @param viableRange - The viable range
 * @param preferredRange - The preferred range
 * @returns Normalized deviation (0-1)
 */
export function calculateDeviation(
  value: number,
  viableRange: ViableRange | undefined,
  preferredRange: ViableRange | undefined
): number {
  // If no ranges defined, deviation is 0
  if (!viableRange && !preferredRange) {
    return 0;
  }

  // Use preferred range for the center, fall back to viable
  const effectivePreferred = preferredRange ?? viableRange;
  const center = getRangeCenter(effectivePreferred);

  if (center === undefined) {
    // Can't calculate deviation without a center
    return 0;
  }

  // Check if outside viable range first
  if (viableRange) {
    if (viableRange.min !== undefined && value < viableRange.min) {
      // Outside viable range on the low end
      const distance = viableRange.min - value;
      const viableSpan = getViableSpan(viableRange);
      // Deviation > 0.5, scaled by how far outside
      return Math.min(1, 0.5 + (distance / (viableSpan || 1)) * 0.5);
    }
    if (viableRange.max !== undefined && value > viableRange.max) {
      // Outside viable range on the high end
      const distance = value - viableRange.max;
      const viableSpan = getViableSpan(viableRange);
      return Math.min(1, 0.5 + (distance / (viableSpan || 1)) * 0.5);
    }
  }

  // Inside viable range - calculate distance from center
  const distanceFromCenter = Math.abs(value - center);

  // Find the distance from center to viable boundary
  const viableMin = viableRange?.min;
  const viableMax = viableRange?.max;
  let maxDistance: number;

  if (viableMin !== undefined && viableMax !== undefined) {
    maxDistance = Math.max(center - viableMin, viableMax - center);
  } else if (viableMin !== undefined) {
    maxDistance = center - viableMin;
  } else if (viableMax !== undefined) {
    maxDistance = viableMax - center;
  } else {
    // No viable bounds, use preferred bounds
    const prefMin = preferredRange?.softMin ?? preferredRange?.min;
    const prefMax = preferredRange?.softMax ?? preferredRange?.max;
    if (prefMin !== undefined && prefMax !== undefined) {
      maxDistance = Math.max(center - prefMin, prefMax - center);
    } else {
      maxDistance = 1; // Fallback
    }
  }

  // Deviation is 0 at center, 0.5 at viable boundary
  return Math.min(0.5, (distanceFromCenter / maxDistance) * 0.5);
}

/**
 * Get the span of a viable range.
 */
function getViableSpan(range: ViableRange): number {
  const min = range.min ?? range.softMin ?? 0;
  const max = range.max ?? range.softMax ?? 0;
  return Math.abs(max - min) || 1;
}

/**
 * Calculate trend based on value change.
 *
 * @param currentValue - The current value
 * @param previousValue - The previous value
 * @param variable - The variable (for context on what "improving" means)
 * @returns Trend direction
 */
export function calculateTrend(
  currentValue: number,
  previousValue: number,
  variable: Variable
): Trend {
  const delta = currentValue - previousValue;

  // Use a small threshold to avoid noise
  const threshold = 0.01; // 1% change threshold

  // Normalize by the viable range if available
  let normalizedDelta = delta;
  if (variable.viableRange) {
    const span = getViableSpan(variable.viableRange);
    normalizedDelta = delta / span;
  }

  if (Math.abs(normalizedDelta) < threshold) {
    return 'stable';
  }

  // Determine what "improving" means
  // For most variables, moving toward the preferred center is improving
  const center = getRangeCenter(variable.preferredRange ?? variable.viableRange);

  if (center !== undefined) {
    const wasCloserToCenter = Math.abs(previousValue - center) > Math.abs(currentValue - center);
    return wasCloserToCenter ? 'improving' : 'degrading';
  }

  // Without a center, assume higher is better (default assumption)
  return delta > 0 ? 'improving' : 'degrading';
}

/**
 * Derive a VariableEstimate from a Variable and observations.
 *
 * This is the main function for Phase 4.3 - it combines:
 * - ComputeSpec evaluation (Phase 4.2)
 * - Range checking (inViableRange, inPreferredRange)
 * - Deviation calculation
 * - Trend calculation
 *
 * @param variable - The Variable to estimate
 * @param observations - Available observations for the variable's node
 * @param options - Optional configuration
 * @returns VariableEstimate or null if no estimate can be derived
 */
export function deriveEstimate(
  variable: Variable,
  observations: Observation[],
  options: DeriveEstimateOptions = {}
): VariableEstimate | null {
  const {
    referenceTime = new Date(),
    previousEstimate,
    previousObservations,
    trendWindowHours = 24,
  } = options;

  // Evaluate compute specs to get the current value
  const computeResult = evaluateComputeSpecs(
    variable.computeSpecs,
    observations,
    referenceTime
  );

  // If no value could be computed, return null
  if (computeResult.value === undefined) {
    return null;
  }

  const value = computeResult.value;

  // Calculate range status
  const inViableRange = isInRange(value, variable.viableRange);
  const inPreferredRange = isInPreferredBounds(value, variable.preferredRange ?? variable.viableRange);

  // Calculate deviation
  const deviation = calculateDeviation(value, variable.viableRange, variable.preferredRange);

  // Calculate trend
  let trend: Trend | undefined;

  if (previousEstimate && typeof previousEstimate.value === 'number') {
    trend = calculateTrend(value, previousEstimate.value, variable);
  } else if (previousObservations && previousObservations.length > 0) {
    // Calculate previous value using observations from before the trend window
    const trendCutoff = new Date(referenceTime.getTime() - trendWindowHours * 60 * 60 * 1000);

    const prevResult = evaluateComputeSpecs(
      variable.computeSpecs,
      previousObservations,
      trendCutoff
    );

    if (prevResult.value !== undefined) {
      trend = calculateTrend(value, prevResult.value, variable);
    }
  }

  return {
    variableId: variable.id,
    value,
    confidence: computeResult.confidence,
    computedAt: referenceTime.toISOString(),
    inViableRange,
    inPreferredRange,
    trend,
    deviation,
  };
}

/**
 * Result of deriving estimates for multiple variables
 */
export type DeriveEstimatesResult = {
  estimates: Map<string, VariableEstimate>;
  failures: Map<string, string>;
};

/**
 * Derive estimates for multiple variables at once.
 *
 * @param variables - Variables to estimate
 * @param observations - Available observations
 * @param options - Optional configuration
 * @returns Map of variable ID to estimate (excludes variables that couldn't be estimated)
 */
export function deriveEstimates(
  variables: Variable[],
  observations: Observation[],
  options: DeriveEstimateOptions = {}
): DeriveEstimatesResult {
  const estimates = new Map<string, VariableEstimate>();
  const failures = new Map<string, string>();

  for (const variable of variables) {
    try {
      const estimate = deriveEstimate(variable, observations, options);
      if (estimate) {
        estimates.set(variable.id, estimate);
      } else {
        failures.set(variable.id, 'No observations matched compute specs');
      }
    } catch (error) {
      failures.set(
        variable.id,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  return { estimates, failures };
}
