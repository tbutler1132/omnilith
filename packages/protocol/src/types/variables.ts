// Variable types - the Active Inference core

import type { Id, Timestamp } from './common.js';

/**
 * Variable kinds determine how values are interpreted
 */
export type VariableKind = 'continuous' | 'ordinal' | 'categorical' | 'boolean';

/**
 * A ViableRange defines acceptable bounds for a variable
 */
export type ViableRange = {
  /**
   * Hard minimum - below this is outside viable range
   */
  min?: number;

  /**
   * Hard maximum - above this is outside viable range
   */
  max?: number;

  /**
   * Soft minimum - below this is suboptimal but viable
   */
  softMin?: number;

  /**
   * Soft maximum - above this is suboptimal but viable
   */
  softMax?: number;

  /**
   * Human-readable note about this range
   */
  note?: string;
};

/**
 * Aggregation methods for computing variable estimates from observations
 */
export type AggregationMethod = 'latest' | 'sum' | 'avg' | 'count' | 'min' | 'max';

/**
 * A ComputeSpec defines how to estimate a variable from observations.
 * Simplified from v0 ProxySpec for v1 - supports filtering observations by type
 * and applying a standard aggregation over a time/count window.
 */
export type ComputeSpec = {
  id: Id;

  /**
   * Observation types to include (exact match or prefix with "*")
   * e.g., ["health.sleep", "health.exercise"]
   */
  observationTypes: string[];

  /**
   * How to aggregate matching observations into a single value
   */
  aggregation: AggregationMethod;

  /**
   * Optional window to limit scope of observations considered
   */
  window?: {
    /**
     * Only consider observations from the last N hours
     */
    hours?: number;

    /**
     * Only consider the last N observations (applied after time filter)
     */
    count?: number;
  };

  /**
   * Confidence/reliability hint for policies (0-1)
   */
  confidence?: number;
};

/**
 * A Variable represents a regulated quantity the system cares about.
 * Variables are canon and must be inspectable, replayable, and interpretable by policies.
 */
export type Variable = {
  id: Id;
  nodeId: Id;

  /**
   * Stable identifier, e.g., "sleep_quality"
   */
  key: string;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * How values are interpreted
   */
  kind: VariableKind;

  /**
   * Unit of measurement, e.g., "hours", "%", "score"
   */
  unit?: string;

  /**
   * Acceptable range - outside this needs intervention
   */
  viableRange?: ViableRange;

  /**
   * Preferred range - optimal state
   */
  preferredRange?: ViableRange;

  /**
   * How to estimate this variable from observations.
   * Multiple compute specs allow combining different observation sources.
   */
  computeSpecs: ComputeSpec[];

  /**
   * Optional priors for Active Inference (future)
   */
  prior?: unknown;

  /**
   * Optional target for Active Inference (future)
   */
  target?: unknown;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * Trend direction for variable estimates
 */
export type Trend = 'improving' | 'stable' | 'degrading';

/**
 * A VariableEstimate is derived state - computed from observations via proxies.
 * Estimates are NOT canon and must be reproducible.
 */
export type VariableEstimate = {
  variableId: Id;

  /**
   * Current estimated value
   */
  value: number | string | boolean;

  /**
   * Confidence in the estimate (0-1)
   */
  confidence: number;

  /**
   * When this estimate was computed
   */
  computedAt: Timestamp;

  /**
   * Is the value within viable range?
   */
  inViableRange: boolean;

  /**
   * Is the value within preferred range?
   */
  inPreferredRange: boolean;

  /**
   * Direction of recent change
   */
  trend?: Trend;

  /**
   * Distance from preferred center (normalized 0-1)
   * 0 = at preferred center
   * 0.5 = at viable boundary
   * 1 = outside viable range
   */
  deviation: number;
};
