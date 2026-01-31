// Episode types - regulatory interventions

import type { Id, Timestamp } from './common.js';

/**
 * Episode kinds define the purpose of the intervention
 */
export type EpisodeKind = 'regulatory' | 'exploratory';

/**
 * Episode status lifecycle
 */
export type EpisodeStatus = 'planned' | 'active' | 'completed' | 'abandoned';

/**
 * Episode intents describe what the episode is trying to accomplish for a variable
 *
 * Regulatory intents:
 * - stabilize: return to viable range
 * - increase: move toward upper preferred
 * - decrease: move toward lower preferred
 * - maintain: hold current position
 *
 * Exploratory intents:
 * - probe: test a boundary without committing
 * - expand: grow capacity (widen viable range)
 * - discover: explore unknown territory
 */
export type EpisodeIntent =
  | 'stabilize'
  | 'increase'
  | 'decrease'
  | 'maintain'
  | 'probe'
  | 'expand'
  | 'discover';

/**
 * A variable binding within an episode
 */
export type EpisodeVariable = {
  variableId: Id;
  intent: EpisodeIntent;
};

/**
 * An Episode is a structured, time-bounded intervention.
 *
 * Episodes serve two purposes:
 * - Regulatory: restore Variables to viable range when they drift
 * - Exploratory: probe boundaries, build capacity, discover new viable states
 *
 * Regulation is not the goal — it's what enables growth.
 */
export type Episode = {
  id: Id;
  nodeId: Id;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * The purpose of this episode
   */
  kind: EpisodeKind;

  /**
   * Variables being targeted and their intents
   */
  variables: EpisodeVariable[];

  /**
   * When the episode starts (optional for planned episodes)
   */
  startsAt?: Timestamp;

  /**
   * When the episode ends (optional for open-ended episodes)
   */
  endsAt?: Timestamp;

  /**
   * Artifacts related to this episode
   */
  relatedArtifactIds?: Id[];

  /**
   * Current status
   */
  status: EpisodeStatus;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};
