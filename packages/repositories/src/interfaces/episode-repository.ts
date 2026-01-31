import type { Id, Episode, EpisodeStatus, EpisodeKind, EpisodeVariable, Timestamp } from '@omnilith/protocol';

/**
 * Input for creating a new Episode
 */
export type CreateEpisodeInput = {
  id?: Id;
  nodeId: Id;
  title: string;
  description?: string;
  kind: EpisodeKind;
  variables: EpisodeVariable[];
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  relatedArtifactIds?: Id[];
  status?: EpisodeStatus;
};

/**
 * Input for updating an Episode
 */
export type UpdateEpisodeInput = {
  title?: string;
  description?: string;
  variables?: EpisodeVariable[];
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  relatedArtifactIds?: Id[];
  status?: EpisodeStatus;
};

/**
 * Filter for listing Episodes
 */
export type EpisodeFilter = {
  nodeId?: Id;
  status?: EpisodeStatus[];
  kind?: EpisodeKind;
  variableId?: Id;
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Episode operations.
 *
 * Episodes are structured, time-bounded interventions - either regulatory
 * (returning to viable range) or exploratory (probing boundaries).
 * Episodes are canon and can only be mutated through Prism.
 */
export interface EpisodeRepository {
  /**
   * Create a new Episode
   */
  create(input: CreateEpisodeInput): Promise<Episode>;

  /**
   * Get an Episode by ID
   * @returns Episode or null if not found
   */
  get(id: Id): Promise<Episode | null>;

  /**
   * List Episodes with optional filtering
   */
  list(filter?: EpisodeFilter): Promise<Episode[]>;

  /**
   * Update an Episode's properties
   * @returns Updated Episode or null if not found
   */
  update(id: Id, input: UpdateEpisodeInput): Promise<Episode | null>;

  /**
   * Transition Episode status.
   * Valid transitions: planned → active → completed/abandoned
   */
  updateStatus(id: Id, status: EpisodeStatus): Promise<Episode | null>;

  /**
   * Get all active Episodes for a Node
   */
  getActive(nodeId: Id): Promise<Episode[]>;

  /**
   * Get Episodes targeting a specific Variable
   */
  getByVariable(variableId: Id): Promise<Episode[]>;

  /**
   * Get Episodes related to a specific Artifact
   */
  getByArtifact(artifactId: Id): Promise<Episode[]>;
}
