import type { Id, Entity, EntityEvent, EntityType, Timestamp } from '@omnilith/protocol';

/**
 * Input for creating a new EntityType
 */
export type CreateEntityTypeInput = {
  id?: Id;
  nodeId: Id;
  typeName: string;
  title: string;
  description?: string;
  schema: Record<string, unknown>;
  eventTypes?: string[];
};

/**
 * Input for creating a new Entity
 */
export type CreateEntityInput = {
  id?: Id;
  nodeId: Id;
  typeId: Id;
  initialState?: Record<string, unknown>;
};

/**
 * Input for appending an EntityEvent
 */
export type AppendEntityEventInput = {
  id?: Id;
  type: string;
  data: unknown;
  actorNodeId: Id;
  timestamp?: Timestamp;
};

/**
 * Filter for querying Entities
 */
export type EntityFilter = {
  nodeId?: Id;
  typeId?: Id;
  typeName?: string;
  limit?: number;
  offset?: number;
};

/**
 * Filter for querying EntityEvents
 */
export type EntityEventFilter = {
  entityId?: Id;
  type?: string;
  actorNodeId?: Id;
  timeRange?: {
    start?: Timestamp;
    end?: Timestamp;
  };
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Entity operations.
 *
 * Entities are durable referents with stable identity - things like songs, projects,
 * or people that persist over time. They're event-sourced: state is computed by
 * replaying events, giving full history and auditability.
 *
 * Multiple Artifacts can reference the same Entity, enabling rich cross-linking.
 */
export interface EntityRepository {
  // --- EntityType operations ---

  /**
   * Create a new EntityType (defines the schema for entities)
   */
  createType(input: CreateEntityTypeInput): Promise<EntityType>;

  /**
   * Get an EntityType by ID
   */
  getType(id: Id): Promise<EntityType | null>;

  /**
   * Get an EntityType by name within a Node
   */
  getTypeByName(nodeId: Id, typeName: string): Promise<EntityType | null>;

  /**
   * List EntityTypes for a Node
   */
  listTypes(nodeId: Id): Promise<EntityType[]>;

  // --- Entity operations ---

  /**
   * Create a new Entity (with 'created' event)
   */
  create(input: CreateEntityInput, actorNodeId: Id): Promise<Entity>;

  /**
   * Get an Entity by ID
   * @returns Entity with current state (materialized from events) or null
   */
  get(id: Id): Promise<Entity | null>;

  /**
   * Query Entities with filters
   */
  query(filter: EntityFilter): Promise<Entity[]>;

  /**
   * Append an event to an Entity's history.
   * State will be recomputed from all events.
   */
  appendEvent(entityId: Id, event: AppendEntityEventInput): Promise<Entity | null>;

  /**
   * Get all events for an Entity
   */
  getEvents(entityId: Id): Promise<EntityEvent[]>;

  /**
   * Query events across entities
   */
  queryEvents(filter: EntityEventFilter): Promise<EntityEvent[]>;

  /**
   * Materialize entity state from events.
   * Used for replay and state reconstruction.
   */
  materializeState(entityId: Id): Promise<Record<string, unknown> | null>;
}
