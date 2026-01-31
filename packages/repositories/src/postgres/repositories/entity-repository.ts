import { eq, and, desc, asc, gte, lte } from 'drizzle-orm';
import type { Database } from '../db.js';
import { entities, entityEvents, entityTypes } from '../schema/index.js';
import type {
  EntityRepository,
  CreateEntityInput,
  CreateEntityTypeInput,
  EntityFilter,
  AppendEntityEventInput,
  EntityEventFilter,
} from '../../interfaces/index.js';
import type { Entity, EntityEvent, EntityType, Id } from '@omnilith/protocol';

export class PgEntityRepository implements EntityRepository {
  constructor(private db: Database) {}

  // Entity Type operations

  async createType(input: CreateEntityTypeInput): Promise<EntityType> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(entityTypes)
      .values({
        id,
        nodeId: input.nodeId,
        typeName: input.typeName,
        title: input.title,
        description: input.description,
        schema: input.schema,
        eventTypes: input.eventTypes,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.rowToEntityType(row);
  }

  async getType(id: Id): Promise<EntityType | null> {
    const [row] = await this.db
      .select()
      .from(entityTypes)
      .where(eq(entityTypes.id, id));
    return row ? this.rowToEntityType(row) : null;
  }

  async getTypeByName(nodeId: Id, typeName: string): Promise<EntityType | null> {
    const [row] = await this.db
      .select()
      .from(entityTypes)
      .where(and(eq(entityTypes.nodeId, nodeId), eq(entityTypes.typeName, typeName)));
    return row ? this.rowToEntityType(row) : null;
  }

  async listTypes(nodeId: Id): Promise<EntityType[]> {
    const rows = await this.db
      .select()
      .from(entityTypes)
      .where(eq(entityTypes.nodeId, nodeId))
      .orderBy(asc(entityTypes.typeName));

    return rows.map((r) => this.rowToEntityType(r));
  }

  // Entity operations

  async create(input: CreateEntityInput, actorNodeId: Id): Promise<Entity> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(entities)
      .values({
        id,
        nodeId: input.nodeId,
        typeId: input.typeId,
        state: input.initialState ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Create initial "created" event
    const eventId = crypto.randomUUID();
    await this.db.insert(entityEvents).values({
      id: eventId,
      entityId: id,
      type: 'created',
      data: input.initialState ?? {},
      timestamp: now,
      actorNodeId,
    });

    // Get the entity with its events
    const events = await this.getEvents(id);
    return this.rowToEntity(row, events);
  }

  async get(id: Id): Promise<Entity | null> {
    const [row] = await this.db.select().from(entities).where(eq(entities.id, id));
    if (!row) return null;

    const events = await this.getEvents(id);
    return this.rowToEntity(row, events);
  }

  async query(filter: EntityFilter): Promise<Entity[]> {
    const conditions = [];

    if (filter.nodeId) {
      conditions.push(eq(entities.nodeId, filter.nodeId));
    }

    if (filter.typeId) {
      conditions.push(eq(entities.typeId, filter.typeId));
    }

    let query = this.db.select().from(entities);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(desc(entities.updatedAt)) as typeof query;

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;

    // Filter by typeName if provided
    let results = rows;
    if (filter.typeName) {
      const typesByName = await Promise.all(
        [...new Set(rows.map((r) => r.typeId))].map((typeId) => this.getType(typeId))
      );
      const typeIdsByName = typesByName
        .filter((t) => t?.typeName === filter.typeName)
        .map((t) => t!.id);
      results = rows.filter((r) => typeIdsByName.includes(r.typeId));
    }

    // Return entities without full event history for list performance
    return results.map((r) => this.rowToEntity(r, []));
  }

  async appendEvent(entityId: Id, event: AppendEntityEventInput): Promise<Entity | null> {
    const entity = await this.get(entityId);
    if (!entity) return null;

    const id = event.id ?? crypto.randomUUID();
    const now = new Date();
    const timestamp = event.timestamp ? new Date(event.timestamp) : now;

    await this.db.insert(entityEvents).values({
      id,
      entityId,
      type: event.type,
      data: event.data,
      timestamp,
      actorNodeId: event.actorNodeId,
    });

    // Update entity state (materialize from events)
    const newState = this.applyEvent(entity.state, {
      type: event.type,
      data: event.data,
    });

    await this.db
      .update(entities)
      .set({
        state: newState,
        updatedAt: now,
      })
      .where(eq(entities.id, entityId));

    // Return updated entity
    return this.get(entityId);
  }

  async getEvents(entityId: Id): Promise<EntityEvent[]> {
    const rows = await this.db
      .select()
      .from(entityEvents)
      .where(eq(entityEvents.entityId, entityId))
      .orderBy(asc(entityEvents.timestamp));

    return rows.map((r) => this.rowToEntityEvent(r));
  }

  async queryEvents(filter: EntityEventFilter): Promise<EntityEvent[]> {
    const conditions = [];

    if (filter.entityId) {
      conditions.push(eq(entityEvents.entityId, filter.entityId));
    }

    if (filter.type) {
      conditions.push(eq(entityEvents.type, filter.type));
    }

    if (filter.actorNodeId) {
      conditions.push(eq(entityEvents.actorNodeId, filter.actorNodeId));
    }

    if (filter.timeRange?.start) {
      conditions.push(gte(entityEvents.timestamp, new Date(filter.timeRange.start)));
    }

    if (filter.timeRange?.end) {
      conditions.push(lte(entityEvents.timestamp, new Date(filter.timeRange.end)));
    }

    let query = this.db.select().from(entityEvents);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(asc(entityEvents.timestamp)) as typeof query;

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.rowToEntityEvent(r));
  }

  async materializeState(entityId: Id): Promise<Record<string, unknown> | null> {
    const events = await this.getEvents(entityId);
    if (events.length === 0) return null;

    // Replay events to rebuild state
    let state: Record<string, unknown> = {};
    for (const event of events) {
      state = this.applyEvent(state, { type: event.type, data: event.data });
    }

    // Update materialized state
    await this.db
      .update(entities)
      .set({
        state,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entityId));

    return state;
  }

  /**
   * Apply an event to state. Override this for custom event handling.
   */
  private applyEvent(
    state: Record<string, unknown>,
    event: { type: string; data: unknown }
  ): Record<string, unknown> {
    // Default behavior: merge event data into state
    if (event.type === 'created') {
      return { ...state, ...(event.data as Record<string, unknown>) };
    }

    // For other events, merge data
    return { ...state, ...(event.data as Record<string, unknown>) };
  }

  private rowToEntityType(row: typeof entityTypes.$inferSelect): EntityType {
    return {
      id: row.id,
      nodeId: row.nodeId,
      typeName: row.typeName,
      title: row.title,
      description: row.description ?? undefined,
      schema: row.schema,
      eventTypes: row.eventTypes ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rowToEntity(
    row: typeof entities.$inferSelect,
    events: EntityEvent[]
  ): Entity {
    return {
      id: row.id,
      nodeId: row.nodeId,
      typeId: row.typeId,
      state: row.state,
      events,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rowToEntityEvent(row: typeof entityEvents.$inferSelect): EntityEvent {
    return {
      id: row.id,
      entityId: row.entityId,
      type: row.type,
      data: row.data,
      timestamp: row.timestamp.toISOString(),
      actorNodeId: row.actorNodeId,
    };
  }
}
