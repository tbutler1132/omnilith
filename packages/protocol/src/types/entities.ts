// Entity types - durable referents with semantic identity

import type { Id, Timestamp } from './common.js';

/**
 * An EntityEvent is an immutable record of something that happened to an entity.
 * Entities are event-sourced - their state is computed by replaying events.
 */
export type EntityEvent = {
  id: Id;
  entityId: Id;

  /**
   * Event type, e.g., "created", "title_changed", "status_updated"
   */
  type: string;

  /**
   * Event data - structure depends on type
   */
  data: unknown;

  /**
   * When this event occurred
   */
  timestamp: Timestamp;

  /**
   * Who caused this event (Subject-Node or Agent-Node)
   */
  actorNodeId: Id;
};

/**
 * An EntityType defines the schema for a kind of entity
 */
export type EntityType = {
  id: Id;
  nodeId: Id;

  /**
   * Type identifier, e.g., "song", "project", "person"
   */
  typeName: string;

  /**
   * Human-readable name
   */
  title: string;

  /**
   * Description of this entity type
   */
  description?: string;

  /**
   * JSON schema for entity fields
   */
  schema: Record<string, unknown>;

  /**
   * Event types this entity supports
   */
  eventTypes?: string[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * An Entity is a durable referent with stable identity across time.
 *
 * Entities provide semantic identity independent of any single artifact or surface.
 * They are NOT UI objects and MUST NOT violate the Projection Law.
 *
 * Example: A "song" entity may be referenced by:
 * - A lyrics artifact
 * - A production notes artifact
 * - A release surface
 *
 * Artifacts reference the entity by ID; the entity itself is never mutated via surfaces.
 */
export type Entity = {
  id: Id;
  nodeId: Id;

  /**
   * The type of this entity
   */
  typeId: Id;

  /**
   * Computed state from replaying events
   * Structure defined by EntityType.schema
   */
  state: Record<string, unknown>;

  /**
   * Event history (append-only)
   */
  events: EntityEvent[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
};
