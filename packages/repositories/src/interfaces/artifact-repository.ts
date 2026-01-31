import type { Id, Artifact, Revision, ArtifactStatus, PageDoc, QuerySpec } from '@omnilith/protocol';

/**
 * Input for creating a new Artifact
 */
export type CreateArtifactInput = {
  id?: Id;
  nodeId: Id;
  title: string;
  about: string;
  notes?: string;
  page: PageDoc;
  status?: ArtifactStatus;
  entityRefs?: Id[];
};

/**
 * Input for updating an Artifact (creates a new revision)
 */
export type UpdateArtifactInput = {
  title?: string;
  about?: string;
  notes?: string;
  page?: PageDoc;
  status?: ArtifactStatus;
  entityRefs?: Id[];
};

/**
 * Revision creation input (used when creating revisions)
 */
export type CreateRevisionInput = {
  authorNodeId: Id;
  message?: string;
};

/**
 * Filter for listing Artifacts
 */
export type ArtifactFilter = {
  nodeId?: Id;
  status?: ArtifactStatus[];
  entityRefs?: Id[];
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Artifact operations.
 *
 * Artifacts are revisioned content objects - notes, pages, documents.
 * Every update creates a new revision, enabling full history tracking.
 * Artifacts can reference Entities to link content to durable identities.
 */
export interface ArtifactRepository {
  /**
   * Create a new Artifact.
   * Creates initial revision at version 1.
   */
  create(input: CreateArtifactInput, revision: CreateRevisionInput): Promise<Artifact>;

  /**
   * Get an Artifact by ID
   * @returns Artifact or null if not found
   */
  get(id: Id): Promise<Artifact | null>;

  /**
   * List Artifacts with optional filtering
   */
  list(filter?: ArtifactFilter): Promise<Artifact[]>;

  /**
   * Query Artifacts using a QuerySpec
   */
  query(nodeId: Id, query: QuerySpec): Promise<Artifact[]>;

  /**
   * Update an Artifact, creating a new revision.
   * Increments trunkVersion automatically.
   * @returns Updated Artifact or null if not found
   */
  update(id: Id, input: UpdateArtifactInput, revision: CreateRevisionInput): Promise<Artifact | null>;

  /**
   * Change Artifact status without creating a full revision.
   * Status transitions: draft → active → published → archived
   */
  updateStatus(id: Id, status: ArtifactStatus, authorNodeId: Id): Promise<Artifact | null>;

  /**
   * Get all revisions for an Artifact
   */
  getRevisions(artifactId: Id): Promise<Revision[]>;

  /**
   * Get a specific revision by version number
   */
  getRevision(artifactId: Id, version: number): Promise<Revision | null>;

  /**
   * Get Artifacts that reference a specific Entity
   */
  getByEntityRef(entityId: Id): Promise<Artifact[]>;
}
