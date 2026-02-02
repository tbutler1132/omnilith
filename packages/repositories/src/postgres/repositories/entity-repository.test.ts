// Tests for Entity Repository (Phase 6.1)
// Verifies entity lifecycle: entity types, entities, events, and state materialization.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity, EntityEvent, EntityType } from '@omnilith/protocol';
import type {
  EntityRepository,
  CreateEntityInput,
  CreateEntityTypeInput,
  EntityFilter,
  AppendEntityEventInput,
  EntityEventFilter,
} from '../../interfaces/index.js';

// In-memory implementation for testing
function createInMemoryEntityRepository(): EntityRepository & { clear(): void } {
  const entityTypes = new Map<string, EntityType>();
  const entities = new Map<string, Entity>();
  const events = new Map<string, EntityEvent[]>(); // entityId -> events

  // Helper to apply event to state
  function applyEvent(
    state: Record<string, unknown>,
    event: { type: string; data: unknown }
  ): Record<string, unknown> {
    // Default behavior: merge event data into state
    return { ...state, ...(event.data as Record<string, unknown>) };
  }

  return {
    // EntityType operations

    async createType(input: CreateEntityTypeInput): Promise<EntityType> {
      const id = input.id ?? `type-${entityTypes.size + 1}`;
      const now = new Date().toISOString();
      const entityType: EntityType = {
        id,
        nodeId: input.nodeId,
        typeName: input.typeName,
        title: input.title,
        description: input.description,
        schema: input.schema,
        eventTypes: input.eventTypes,
        createdAt: now,
        updatedAt: now,
      };
      entityTypes.set(id, entityType);
      return entityType;
    },

    async getType(id: string): Promise<EntityType | null> {
      return entityTypes.get(id) ?? null;
    },

    async getTypeByName(nodeId: string, typeName: string): Promise<EntityType | null> {
      for (const entityType of entityTypes.values()) {
        if (entityType.nodeId === nodeId && entityType.typeName === typeName) {
          return entityType;
        }
      }
      return null;
    },

    async listTypes(nodeId: string): Promise<EntityType[]> {
      return Array.from(entityTypes.values())
        .filter((t) => t.nodeId === nodeId)
        .sort((a, b) => a.typeName.localeCompare(b.typeName));
    },

    // Entity operations

    async create(input: CreateEntityInput, actorNodeId: string): Promise<Entity> {
      const id = input.id ?? `entity-${entities.size + 1}`;
      const now = new Date().toISOString();

      // Create initial "created" event
      const eventId = `event-${id}-1`;
      const createdEvent: EntityEvent = {
        id: eventId,
        entityId: id,
        type: 'created',
        data: input.initialState ?? {},
        timestamp: now,
        actorNodeId,
      };

      events.set(id, [createdEvent]);

      const entity: Entity = {
        id,
        nodeId: input.nodeId,
        typeId: input.typeId,
        state: input.initialState ?? {},
        events: [createdEvent],
        createdAt: now,
        updatedAt: now,
      };
      entities.set(id, entity);
      return entity;
    },

    async get(id: string): Promise<Entity | null> {
      const entity = entities.get(id);
      if (!entity) return null;

      // Return with full event history
      return {
        ...entity,
        events: events.get(id) ?? [],
      };
    },

    async query(filter: EntityFilter): Promise<Entity[]> {
      let result = Array.from(entities.values());

      if (filter.nodeId) {
        result = result.filter((e) => e.nodeId === filter.nodeId);
      }
      if (filter.typeId) {
        result = result.filter((e) => e.typeId === filter.typeId);
      }
      if (filter.typeName) {
        // Filter by typeName (requires lookup)
        const typesByName = Array.from(entityTypes.values()).filter(
          (t) => t.typeName === filter.typeName
        );
        const typeIds = typesByName.map((t) => t.id);
        result = result.filter((e) => typeIds.includes(e.typeId));
      }
      if (filter.offset) {
        result = result.slice(filter.offset);
      }
      if (filter.limit) {
        result = result.slice(0, filter.limit);
      }

      // Return without full event history for list performance
      return result.map((e) => ({ ...e, events: [] }));
    },

    async appendEvent(
      entityId: string,
      event: AppendEntityEventInput
    ): Promise<Entity | null> {
      const entity = entities.get(entityId);
      if (!entity) return null;

      const id = event.id ?? `event-${entityId}-${(events.get(entityId)?.length ?? 0) + 1}`;
      const now = new Date().toISOString();
      const timestamp = event.timestamp ?? now;

      const newEvent: EntityEvent = {
        id,
        entityId,
        type: event.type,
        data: event.data,
        timestamp,
        actorNodeId: event.actorNodeId,
      };

      const entityEvents = events.get(entityId) ?? [];
      entityEvents.push(newEvent);
      events.set(entityId, entityEvents);

      // Update materialized state
      const newState = applyEvent(entity.state, {
        type: event.type,
        data: event.data,
      });

      const updated: Entity = {
        ...entity,
        state: newState,
        events: entityEvents,
        updatedAt: now,
      };
      entities.set(entityId, updated);

      return updated;
    },

    async getEvents(entityId: string): Promise<EntityEvent[]> {
      const entityEvents = events.get(entityId) ?? [];
      // Sort by timestamp
      return [...entityEvents].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    },

    async queryEvents(filter: EntityEventFilter): Promise<EntityEvent[]> {
      let result: EntityEvent[] = [];

      if (filter.entityId) {
        result = events.get(filter.entityId) ?? [];
      } else {
        // Collect all events
        for (const entityEvents of events.values()) {
          result.push(...entityEvents);
        }
      }

      if (filter.type) {
        result = result.filter((e) => e.type === filter.type);
      }
      if (filter.actorNodeId) {
        result = result.filter((e) => e.actorNodeId === filter.actorNodeId);
      }
      if (filter.timeRange?.start) {
        const start = new Date(filter.timeRange.start).getTime();
        result = result.filter((e) => new Date(e.timestamp).getTime() >= start);
      }
      if (filter.timeRange?.end) {
        const end = new Date(filter.timeRange.end).getTime();
        result = result.filter((e) => new Date(e.timestamp).getTime() <= end);
      }

      // Sort by timestamp
      result.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (filter.offset) {
        result = result.slice(filter.offset);
      }
      if (filter.limit) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },

    async materializeState(entityId: string): Promise<Record<string, unknown> | null> {
      const entityEvents = events.get(entityId);
      if (!entityEvents || entityEvents.length === 0) return null;

      // Replay events to rebuild state
      let state: Record<string, unknown> = {};
      const sortedEvents = [...entityEvents].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const event of sortedEvents) {
        state = applyEvent(state, { type: event.type, data: event.data });
      }

      // Update entity with materialized state
      const entity = entities.get(entityId);
      if (entity) {
        entities.set(entityId, {
          ...entity,
          state,
          updatedAt: new Date().toISOString(),
        });
      }

      return state;
    },

    clear() {
      entityTypes.clear();
      entities.clear();
      events.clear();
    },
  };
}

// --- Tests ---

describe('EntityRepository', () => {
  let repo: ReturnType<typeof createInMemoryEntityRepository>;

  beforeEach(() => {
    repo = createInMemoryEntityRepository();
  });

  // --- EntityType Tests ---

  describe('createType', () => {
    it('creates an entity type with minimal required fields', async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      expect(entityType.id).toBeDefined();
      expect(entityType.nodeId).toBe('node-1');
      expect(entityType.typeName).toBe('song');
      expect(entityType.title).toBe('Song');
      expect(entityType.schema).toEqual({});
      expect(entityType.createdAt).toBeDefined();
      expect(entityType.updatedAt).toBeDefined();
    });

    it('creates an entity type with all fields', async () => {
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string' },
          duration: { type: 'number' },
          status: { type: 'string', enum: ['draft', 'released'] },
        },
      };

      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        description: 'A musical composition',
        schema,
        eventTypes: ['created', 'title_changed', 'status_changed', 'released'],
      });

      expect(entityType.description).toBe('A musical composition');
      expect(entityType.schema).toEqual(schema);
      expect(entityType.eventTypes).toEqual([
        'created',
        'title_changed',
        'status_changed',
        'released',
      ]);
    });

    it('uses provided id when specified', async () => {
      const entityType = await repo.createType({
        id: 'custom-type-id',
        nodeId: 'node-1',
        typeName: 'project',
        title: 'Project',
        schema: {},
      });

      expect(entityType.id).toBe('custom-type-id');
    });
  });

  describe('getType', () => {
    it('returns an entity type by id', async () => {
      const created = await repo.createType({
        id: 'type-1',
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const retrieved = await repo.getType('type-1');

      expect(retrieved).toEqual(created);
    });

    it('returns null for non-existent entity type', async () => {
      const result = await repo.getType('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getTypeByName', () => {
    it('returns an entity type by node id and type name', async () => {
      await repo.createType({
        id: 'type-1',
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const result = await repo.getTypeByName('node-1', 'song');

      expect(result).toBeDefined();
      expect(result?.id).toBe('type-1');
      expect(result?.typeName).toBe('song');
    });

    it('returns null when type name not found in node', async () => {
      await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const result = await repo.getTypeByName('node-1', 'project');

      expect(result).toBeNull();
    });

    it('returns null when type name exists in different node', async () => {
      await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const result = await repo.getTypeByName('node-2', 'song');

      expect(result).toBeNull();
    });
  });

  describe('listTypes', () => {
    beforeEach(async () => {
      await repo.createType({
        nodeId: 'node-1',
        typeName: 'project',
        title: 'Project',
        schema: {},
      });
      await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });
      await repo.createType({
        nodeId: 'node-2',
        typeName: 'person',
        title: 'Person',
        schema: {},
      });
    });

    it('returns all entity types for a node', async () => {
      const result = await repo.listTypes('node-1');

      expect(result).toHaveLength(2);
      expect(result.every((t) => t.nodeId === 'node-1')).toBe(true);
    });

    it('returns types sorted by typeName', async () => {
      const result = await repo.listTypes('node-1');

      expect(result[0].typeName).toBe('project');
      expect(result[1].typeName).toBe('song');
    });

    it('returns empty array for node with no types', async () => {
      const result = await repo.listTypes('node-without-types');

      expect(result).toEqual([]);
    });
  });

  // --- Entity Tests ---

  describe('create', () => {
    let typeId: string;

    beforeEach(async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });
      typeId = entityType.id;
    });

    it('creates an entity with minimal required fields', async () => {
      const entity = await repo.create(
        {
          nodeId: 'node-1',
          typeId,
        },
        'actor-1'
      );

      expect(entity.id).toBeDefined();
      expect(entity.nodeId).toBe('node-1');
      expect(entity.typeId).toBe(typeId);
      expect(entity.state).toEqual({});
      expect(entity.events).toHaveLength(1);
      expect(entity.events[0].type).toBe('created');
      expect(entity.createdAt).toBeDefined();
      expect(entity.updatedAt).toBeDefined();
    });

    it('creates an entity with initial state', async () => {
      const initialState = { title: 'My Song', status: 'draft' };

      const entity = await repo.create(
        {
          nodeId: 'node-1',
          typeId,
          initialState,
        },
        'actor-1'
      );

      expect(entity.state).toEqual(initialState);
      expect(entity.events[0].data).toEqual(initialState);
    });

    it('uses provided id when specified', async () => {
      const entity = await repo.create(
        {
          id: 'custom-entity-id',
          nodeId: 'node-1',
          typeId,
        },
        'actor-1'
      );

      expect(entity.id).toBe('custom-entity-id');
    });

    it('records the actor who created the entity', async () => {
      const createdEntity = await repo.create(
        {
          nodeId: 'node-1',
          typeId,
        },
        'user-123'
      );

      expect(createdEntity.events[0].actorNodeId).toBe('user-123');
    });
  });

  describe('get', () => {
    let typeId: string;

    beforeEach(async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });
      typeId = entityType.id;
    });

    it('returns an entity by id with full event history', async () => {
      await repo.create(
        {
          id: 'entity-1',
          nodeId: 'node-1',
          typeId,
          initialState: { title: 'Original' },
        },
        'actor-1'
      );

      await repo.appendEvent('entity-1', {
        type: 'title_changed',
        data: { title: 'Updated' },
        actorNodeId: 'actor-1',
      });

      const retrieved = await repo.get('entity-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.events).toHaveLength(2);
      expect(retrieved?.state.title).toBe('Updated');
    });

    it('returns null for non-existent entity', async () => {
      const result = await repo.get('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('query', () => {
    let songTypeId: string;
    let projectTypeId: string;

    beforeEach(async () => {
      const songType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });
      songTypeId = songType.id;

      const projectType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'project',
        title: 'Project',
        schema: {},
      });
      projectTypeId = projectType.id;

      await repo.create({ nodeId: 'node-1', typeId: songTypeId }, 'actor-1');
      await repo.create({ nodeId: 'node-1', typeId: songTypeId }, 'actor-1');
      await repo.create({ nodeId: 'node-1', typeId: projectTypeId }, 'actor-1');
      await repo.create({ nodeId: 'node-2', typeId: songTypeId }, 'actor-1');
    });

    it('returns all entities when no filter', async () => {
      const result = await repo.query({});

      expect(result).toHaveLength(4);
    });

    it('filters by nodeId', async () => {
      const result = await repo.query({ nodeId: 'node-1' });

      expect(result).toHaveLength(3);
      expect(result.every((e) => e.nodeId === 'node-1')).toBe(true);
    });

    it('filters by typeId', async () => {
      const result = await repo.query({ typeId: songTypeId });

      expect(result).toHaveLength(3);
      expect(result.every((e) => e.typeId === songTypeId)).toBe(true);
    });

    it('filters by typeName', async () => {
      const result = await repo.query({ typeName: 'project' });

      expect(result).toHaveLength(1);
      expect(result[0].typeId).toBe(projectTypeId);
    });

    it('applies limit', async () => {
      const result = await repo.query({ limit: 2 });

      expect(result).toHaveLength(2);
    });

    it('applies offset', async () => {
      const result = await repo.query({ offset: 2 });

      expect(result).toHaveLength(2);
    });

    it('combines filters', async () => {
      const result = await repo.query({ nodeId: 'node-1', typeId: songTypeId });

      expect(result).toHaveLength(2);
    });

    it('returns entities without full event history for list performance', async () => {
      const result = await repo.query({});

      // Events should be empty in list results
      expect(result.every((e) => e.events.length === 0)).toBe(true);
    });
  });

  // --- Event Tests ---

  describe('appendEvent', () => {
    let typeId: string;
    let entityId: string;

    beforeEach(async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });
      typeId = entityType.id;

      const entity = await repo.create(
        {
          id: 'entity-1',
          nodeId: 'node-1',
          typeId,
          initialState: { title: 'Original Title', status: 'draft' },
        },
        'actor-1'
      );
      entityId = entity.id;
    });

    it('appends an event to the entity', async () => {
      const updated = await repo.appendEvent(entityId, {
        type: 'title_changed',
        data: { title: 'New Title' },
        actorNodeId: 'actor-2',
      });

      expect(updated?.events).toHaveLength(2);
      expect(updated?.events[1].type).toBe('title_changed');
      expect(updated?.events[1].actorNodeId).toBe('actor-2');
    });

    it('updates materialized state after appending event', async () => {
      const updated = await repo.appendEvent(entityId, {
        type: 'title_changed',
        data: { title: 'New Title' },
        actorNodeId: 'actor-1',
      });

      expect(updated?.state.title).toBe('New Title');
      // Original fields should be preserved
      expect(updated?.state.status).toBe('draft');
    });

    it('returns null for non-existent entity', async () => {
      const result = await repo.appendEvent('non-existent', {
        type: 'updated',
        data: {},
        actorNodeId: 'actor-1',
      });

      expect(result).toBeNull();
    });

    it('uses provided event id when specified', async () => {
      const updated = await repo.appendEvent(entityId, {
        id: 'custom-event-id',
        type: 'status_changed',
        data: { status: 'released' },
        actorNodeId: 'actor-1',
      });

      expect(updated?.events[1].id).toBe('custom-event-id');
    });

    it('uses provided timestamp when specified', async () => {
      const timestamp = '2025-01-15T10:00:00.000Z';

      const updated = await repo.appendEvent(entityId, {
        type: 'released',
        data: { releaseDate: timestamp },
        actorNodeId: 'actor-1',
        timestamp,
      });

      expect(updated?.events[1].timestamp).toBe(timestamp);
    });

    it('appends multiple events', async () => {
      await repo.appendEvent(entityId, {
        type: 'title_changed',
        data: { title: 'Second Title' },
        actorNodeId: 'actor-1',
      });

      await repo.appendEvent(entityId, {
        type: 'status_changed',
        data: { status: 'released' },
        actorNodeId: 'actor-1',
      });

      const entity = await repo.get(entityId);

      expect(entity?.events).toHaveLength(3);
      expect(entity?.state.title).toBe('Second Title');
      expect(entity?.state.status).toBe('released');
    });

    it('updates updatedAt timestamp', async () => {
      const before = await repo.get(entityId);

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const after = await repo.appendEvent(entityId, {
        type: 'updated',
        data: {},
        actorNodeId: 'actor-1',
      });

      expect(after?.updatedAt).not.toBe(before?.updatedAt);
    });
  });

  describe('getEvents', () => {
    let entityId: string;

    beforeEach(async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const entity = await repo.create(
        {
          id: 'entity-1',
          nodeId: 'node-1',
          typeId: entityType.id,
          initialState: { title: 'Song' },
        },
        'actor-1'
      );
      entityId = entity.id;

      await repo.appendEvent(entityId, {
        type: 'title_changed',
        data: { title: 'New Title' },
        actorNodeId: 'actor-1',
      });

      await repo.appendEvent(entityId, {
        type: 'status_changed',
        data: { status: 'released' },
        actorNodeId: 'actor-2',
      });
    });

    it('returns all events for an entity', async () => {
      const events = await repo.getEvents(entityId);

      expect(events).toHaveLength(3);
    });

    it('returns events in chronological order', async () => {
      const events = await repo.getEvents(entityId);

      expect(events[0].type).toBe('created');
      expect(events[1].type).toBe('title_changed');
      expect(events[2].type).toBe('status_changed');
    });

    it('returns empty array for non-existent entity', async () => {
      const events = await repo.getEvents('non-existent');

      expect(events).toEqual([]);
    });
  });

  describe('queryEvents', () => {
    let entity1Id: string;
    let entity2Id: string;

    beforeEach(async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const entity1 = await repo.create(
        { nodeId: 'node-1', typeId: entityType.id },
        'actor-1'
      );
      entity1Id = entity1.id;

      const entity2 = await repo.create(
        { nodeId: 'node-1', typeId: entityType.id },
        'actor-2'
      );
      entity2Id = entity2.id;

      await repo.appendEvent(entity1Id, {
        type: 'title_changed',
        data: { title: 'Title 1' },
        actorNodeId: 'actor-1',
      });

      await repo.appendEvent(entity2Id, {
        type: 'title_changed',
        data: { title: 'Title 2' },
        actorNodeId: 'actor-2',
      });
    });

    it('filters by entityId', async () => {
      const events = await repo.queryEvents({ entityId: entity1Id });

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.entityId === entity1Id)).toBe(true);
    });

    it('filters by event type', async () => {
      const events = await repo.queryEvents({ type: 'created' });

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.type === 'created')).toBe(true);
    });

    it('filters by actorNodeId', async () => {
      const events = await repo.queryEvents({ actorNodeId: 'actor-1' });

      expect(events).toHaveLength(2); // created + title_changed for entity1
      expect(events.every((e) => e.actorNodeId === 'actor-1')).toBe(true);
    });

    it('filters by time range', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 1000);

      const events = await repo.queryEvents({
        timeRange: { start: earlier.toISOString() },
      });

      expect(events.length).toBeGreaterThan(0);
    });

    it('applies limit', async () => {
      const events = await repo.queryEvents({ limit: 2 });

      expect(events).toHaveLength(2);
    });

    it('applies offset', async () => {
      const allEvents = await repo.queryEvents({});
      const offsetEvents = await repo.queryEvents({ offset: 2 });

      expect(offsetEvents).toHaveLength(allEvents.length - 2);
    });

    it('combines filters', async () => {
      const events = await repo.queryEvents({
        entityId: entity1Id,
        type: 'title_changed',
      });

      expect(events).toHaveLength(1);
      expect(events[0].entityId).toBe(entity1Id);
      expect(events[0].type).toBe('title_changed');
    });

    it('returns events in chronological order', async () => {
      const events = await repo.queryEvents({});

      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].timestamp).getTime();
        const curr = new Date(events[i].timestamp).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  // --- State Materialization Tests ---

  describe('materializeState', () => {
    let entityId: string;

    beforeEach(async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const entity = await repo.create(
        {
          id: 'entity-1',
          nodeId: 'node-1',
          typeId: entityType.id,
          initialState: { title: 'Original', version: 1 },
        },
        'actor-1'
      );
      entityId = entity.id;
    });

    it('rebuilds state from events', async () => {
      await repo.appendEvent(entityId, {
        type: 'title_changed',
        data: { title: 'New Title' },
        actorNodeId: 'actor-1',
      });

      await repo.appendEvent(entityId, {
        type: 'version_incremented',
        data: { version: 2 },
        actorNodeId: 'actor-1',
      });

      const state = await repo.materializeState(entityId);

      expect(state).toEqual({
        title: 'New Title',
        version: 2,
      });
    });

    it('returns null for entity with no events', async () => {
      const state = await repo.materializeState('non-existent');

      expect(state).toBeNull();
    });

    it('updates the entity record with materialized state', async () => {
      await repo.appendEvent(entityId, {
        type: 'updated',
        data: { newField: 'value' },
        actorNodeId: 'actor-1',
      });

      await repo.materializeState(entityId);

      const entity = await repo.get(entityId);
      expect(entity?.state.newField).toBe('value');
    });

    it('handles state with overlapping fields correctly', async () => {
      await repo.appendEvent(entityId, {
        type: 'updated',
        data: { title: 'Second Title' },
        actorNodeId: 'actor-1',
      });

      await repo.appendEvent(entityId, {
        type: 'updated',
        data: { title: 'Third Title' },
        actorNodeId: 'actor-1',
      });

      const state = await repo.materializeState(entityId);

      expect(state?.title).toBe('Third Title');
    });
  });

  // --- Integration Tests ---

  describe('Entity lifecycle integration', () => {
    it('supports full entity lifecycle', async () => {
      // 1. Create entity type
      const entityType = await repo.createType({
        nodeId: 'music-node',
        typeName: 'song',
        title: 'Song',
        description: 'A musical composition',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            status: { type: 'string' },
            duration: { type: 'number' },
          },
        },
        eventTypes: ['created', 'title_changed', 'status_changed', 'released'],
      });

      expect(entityType.id).toBeDefined();

      // 2. Create entity
      const entity = await repo.create(
        {
          nodeId: 'music-node',
          typeId: entityType.id,
          initialState: {
            title: 'My Song',
            status: 'draft',
            duration: 180,
          },
        },
        'user-1'
      );

      expect(entity.state.title).toBe('My Song');
      expect(entity.events).toHaveLength(1);

      // 3. Append events
      await repo.appendEvent(entity.id, {
        type: 'title_changed',
        data: { title: 'My Amazing Song' },
        actorNodeId: 'user-1',
      });

      await repo.appendEvent(entity.id, {
        type: 'status_changed',
        data: { status: 'recording' },
        actorNodeId: 'user-1',
      });

      await repo.appendEvent(entity.id, {
        type: 'released',
        data: { status: 'released', releaseDate: '2025-01-15' },
        actorNodeId: 'user-1',
      });

      // 4. Verify state
      const updated = await repo.get(entity.id);

      expect(updated?.state.title).toBe('My Amazing Song');
      expect(updated?.state.status).toBe('released');
      expect(updated?.state.releaseDate).toBe('2025-01-15');
      expect(updated?.events).toHaveLength(4);

      // 5. Query events
      const titleChanges = await repo.queryEvents({
        entityId: entity.id,
        type: 'title_changed',
      });

      expect(titleChanges).toHaveLength(1);

      // 6. Materialize state (verify consistency)
      const materializedState = await repo.materializeState(entity.id);

      expect(materializedState).toEqual(updated?.state);
    });

    it('supports multiple nodes with independent entities', async () => {
      // Create entity types in different nodes
      const musicType = await repo.createType({
        nodeId: 'music-node',
        typeName: 'song',
        title: 'Song',
        schema: {},
      });

      const projectType = await repo.createType({
        nodeId: 'work-node',
        typeName: 'project',
        title: 'Project',
        schema: {},
      });

      // Create entities in different nodes
      await repo.create(
        { nodeId: 'music-node', typeId: musicType.id, initialState: { title: 'Song 1' } },
        'user-1'
      );
      await repo.create(
        { nodeId: 'music-node', typeId: musicType.id, initialState: { title: 'Song 2' } },
        'user-1'
      );
      await repo.create(
        { nodeId: 'work-node', typeId: projectType.id, initialState: { name: 'Project A' } },
        'user-1'
      );

      // Verify isolation
      const musicEntities = await repo.query({ nodeId: 'music-node' });
      const workEntities = await repo.query({ nodeId: 'work-node' });

      expect(musicEntities).toHaveLength(2);
      expect(workEntities).toHaveLength(1);

      // Verify type lookup is node-scoped
      const musicSongType = await repo.getTypeByName('music-node', 'song');
      const workSongType = await repo.getTypeByName('work-node', 'song');

      expect(musicSongType).toBeDefined();
      expect(workSongType).toBeNull();
    });

    it('preserves event ordering across actors', async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'document',
        title: 'Document',
        schema: {},
      });

      const entity = await repo.create(
        { nodeId: 'node-1', typeId: entityType.id },
        'user-1'
      );

      // Multiple actors make changes
      await repo.appendEvent(entity.id, {
        type: 'edited',
        data: { editor: 'user-2' },
        actorNodeId: 'user-2',
      });

      await repo.appendEvent(entity.id, {
        type: 'edited',
        data: { editor: 'user-3' },
        actorNodeId: 'user-3',
      });

      await repo.appendEvent(entity.id, {
        type: 'edited',
        data: { editor: 'user-1' },
        actorNodeId: 'user-1',
      });

      const events = await repo.getEvents(entity.id);

      // Verify events are in order
      expect(events[0].type).toBe('created');
      expect(events[1].data).toEqual({ editor: 'user-2' });
      expect(events[2].data).toEqual({ editor: 'user-3' });
      expect(events[3].data).toEqual({ editor: 'user-1' });

      // Verify final state reflects last edit
      const finalEntity = await repo.get(entity.id);
      expect(finalEntity?.state.editor).toBe('user-1');
    });

    it('supports event replay for state consistency', async () => {
      const entityType = await repo.createType({
        nodeId: 'node-1',
        typeName: 'counter',
        title: 'Counter',
        schema: {},
      });

      const entity = await repo.create(
        {
          nodeId: 'node-1',
          typeId: entityType.id,
          initialState: { count: 0 },
        },
        'actor-1'
      );

      // Increment count multiple times
      for (let i = 1; i <= 5; i++) {
        await repo.appendEvent(entity.id, {
          type: 'incremented',
          data: { count: i },
          actorNodeId: 'actor-1',
        });
      }

      // Materialize state
      const state = await repo.materializeState(entity.id);

      // Final state should have count = 5 (last event wins with shallow merge)
      expect(state?.count).toBe(5);

      // Verify through get
      const retrieved = await repo.get(entity.id);
      expect(retrieved?.state.count).toBe(5);
      expect(retrieved?.events).toHaveLength(6); // 1 created + 5 incremented
    });
  });
});
