// Artifact types - revisioned content objects

import type { Id, Timestamp } from './common.js';

/**
 * Block types for PageDoc content
 */
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'list_item'
  | 'code'
  | 'blockquote'
  | 'image'
  | 'audio'
  | 'video'
  | 'divider'
  | 'table'
  | 'embed'
  | 'artifact_ref'; // references another artifact by ID

/**
 * A Block is a structural unit of content.
 * Blocks are portable and renderer-agnostic.
 */
export type Block = {
  id: Id;
  type: BlockType | string; // string allows pack-defined block types

  /**
   * Block content - structure depends on type
   */
  content: unknown;

  /**
   * Optional child blocks (for nested structures like lists)
   */
  children?: Block[];

  /**
   * Optional metadata
   */
  metadata?: Record<string, unknown>;
};

/**
 * A PageDoc is the block document format used by Artifacts
 */
export type PageDoc = {
  version: 1;
  blocks: Block[];
};

/**
 * Artifact status lifecycle
 */
export type ArtifactStatus = 'draft' | 'active' | 'published' | 'archived';

/**
 * An Artifact is a revisioned content object.
 * Every save creates an immutable revision.
 */
export type Artifact = {
  id: Id;
  nodeId: Id;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * Markdown description (required)
   */
  about: string;

  /**
   * Optional markdown notes
   */
  notes?: string;

  /**
   * The block document content
   */
  page: PageDoc;

  /**
   * Current status in the lifecycle
   */
  status: ArtifactStatus;

  /**
   * Current trunk version number
   */
  trunkVersion: number;

  /**
   * Entity IDs this artifact references
   */
  entityRefs?: Id[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * A Revision is an immutable snapshot of an artifact at a point in time
 */
export type Revision = {
  id: Id;
  artifactId: Id;

  /**
   * Version number (1-indexed, incrementing)
   */
  version: number;

  /**
   * Snapshot of artifact fields at this version
   */
  snapshot: {
    title: string;
    about: string;
    notes?: string;
    page: PageDoc;
    status: ArtifactStatus;
  };

  /**
   * Who created this revision
   */
  authorNodeId: Id;

  /**
   * Optional commit message
   */
  message?: string;

  createdAt: Timestamp;
};
