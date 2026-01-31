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
 * Observation filter for querying the observation log
 */
export type ObservationFilter = {
  nodeId?: Id;
  type?: string;
  typePrefix?: string;
  tags?: string[];
  timeRange?: {
    start?: Timestamp;
    end?: Timestamp;
  };
  provenance?: {
    origin?: 'organic' | 'synthetic';
    sourceId?: Id;
  };
  limit?: number;
  offset?: number;
};
