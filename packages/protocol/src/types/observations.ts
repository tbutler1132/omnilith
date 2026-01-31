// Observation types - the event log

import type { Id, Timestamp } from './common.js';

/**
 * Provenance tracks the origin of an observation.
 * All observations MUST have provenance.
 */
export type Provenance = {
  /**
   * The Subject-Node or Agent-Node that created this observation
   */
  sourceId: Id;

  /**
   * For agents: the delegating Subject-Node
   */
  sponsorId?: Id;

  /**
   * How the observation was created
   * e.g., "manual_entry", "sensor_ingest", "agent_inference"
   */
  method?: string;

  /**
   * For agent-generated observations: confidence level 0-1
   */
  confidence?: number;
};

/**
 * An Observation is an immutable record of something that happened.
 * Observations are append-only and replayable.
 */
export type Observation = {
  id: Id;

  /**
   * The node this observation belongs to
   */
  nodeId: Id;

  /**
   * Hierarchical type string, e.g., "health.sleep" or "work.task.completed"
   */
  type: string;

  /**
   * When the observation was recorded
   */
  timestamp: Timestamp;

  /**
   * The observation data - structure depends on type
   */
  payload: unknown;

  /**
   * Origin and attribution metadata
   */
  provenance: Provenance;

  /**
   * Optional tags for categorization
   */
  tags?: string[];
};
