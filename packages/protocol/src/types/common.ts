// Common types used across the protocol

/**
 * ISO 8601 timestamp string
 */
export type Timestamp = string;

/**
 * UUID string identifier
 */
export type Id = string;

/**
 * Query specification for filtering artifacts or observations
 */
export type QuerySpec = {
  /**
   * Filter by type pattern (supports wildcards)
   */
  type?: string;

  /**
   * Filter by tags (AND logic)
   */
  tags?: string[];

  /**
   * Filter by status
   */
  status?: string[];

  /**
   * Filter by time range
   */
  timeRange?: {
    start?: Timestamp;
    end?: Timestamp;
  };

  /**
   * Maximum number of results
   */
  limit?: number;

  /**
   * Offset for pagination
   */
  offset?: number;

  /**
   * Sort order
   */
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
};

/**
 * Observation filter for querying the observation log.
 *
 * IMPORTANT: To prevent unbounded I/O, limit is required and capped at 1000.
 * Repository implementations MUST enforce a default limit of 100 and
 * a default window of 24 hours if not specified.
 */
export type ObservationFilter = {
  nodeId?: Id;
  type?: string;
  typePrefix?: string;
  tags?: string[];

  /**
   * Time window for filtering observations.
   * If not specified, defaults to last 24 hours.
   */
  window?: {
    /**
     * Only include observations from the last N hours
     */
    hours?: number;

    /**
     * Only include observations after this timestamp
     */
    since?: Timestamp;
  };

  /**
   * Legacy time range filter (prefer 'window' for new code)
   */
  timeRange?: {
    start?: Timestamp;
    end?: Timestamp;
  };

  provenance?: {
    origin?: 'organic' | 'synthetic';
    sourceId?: Id;
  };

  /**
   * Maximum number of results to return.
   * Required. Max 1000, default 100.
   */
  limit: number;

  offset?: number;
};
