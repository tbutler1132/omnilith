import type { Id, Observation, ObservationFilter, Provenance } from '@omnilith/protocol';

/**
 * Input for appending a new Observation
 */
export type AppendObservationInput = {
  id?: Id;
  nodeId: Id;
  type: string;
  timestamp?: string; // ISO 8601, defaults to now
  payload: unknown;
  provenance: Provenance;
  tags?: string[];
};

/**
 * Repository interface for Observation operations.
 *
 * Observations are the sensory input of the system - immutable, append-only records
 * of things that happened. Every observation has mandatory provenance tracking.
 *
 * The observation log is canon and must be preserved for replay.
 */
export interface ObservationRepository {
  /**
   * Append a new Observation to the log.
   * Observations are immutable once appended.
   */
  append(input: AppendObservationInput): Promise<Observation>;

  /**
   * Get an Observation by ID
   * @returns Observation or null if not found
   */
  get(id: Id): Promise<Observation | null>;

  /**
   * Query observations with filters.
   * Supports filtering by node, type, time range, tags, and provenance.
   */
  query(filter: ObservationFilter): Promise<Observation[]>;

  /**
   * Count observations matching a filter.
   * Useful for pagination and analytics.
   */
  count(filter: ObservationFilter): Promise<number>;

  /**
   * Get observations by type pattern for a specific node.
   * Convenience method for policy evaluation.
   */
  getByType(nodeId: Id, typePattern: string, limit?: number): Promise<Observation[]>;

  /**
   * Get the most recent observations for a node.
   * Useful for building policy context.
   */
  getRecent(nodeId: Id, limit: number): Promise<Observation[]>;

  /**
   * Stream observations for export (NDJSON format support).
   * Used for bundle export operations.
   */
  stream(filter: ObservationFilter): AsyncIterable<Observation>;
}
