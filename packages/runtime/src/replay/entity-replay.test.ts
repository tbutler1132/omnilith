// Tests for entity event replay

import { describe, it, expect, vi } from 'vitest';
import type { Entity, EntityEvent } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  replayEntityEvents,
  materializeEntityState,
  verifyEntityState,
  verifyEntities,
  defaultEventReducer,
} from './entity-replay.js';

// --- Test Fixtures ---

function createMockEvent(
  id: string,
  type: string,
  data: unknown,
  timestamp?: string
): EntityEvent {
  return {
    id,
    entityId: 'entity-1',
    type,
    data,
    timestamp: timestamp ?? '2024-01-15T00:00:00Z',
    actorNodeId: 'node-1',
  };
}

function createMockEntity(state: Record<string, unknown>, events: EntityEvent[]): Entity {
  return {
    id: 'entity-1',
    nodeId: 'node-1',
    typeId: 'type-1',
    state,
    events,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockRepos(entity: Entity | null): RepositoryContext {
  return {
    entities: {
      get: vi.fn().mockResolvedValue(entity),
      getEvents: vi.fn().mockResolvedValue(entity?.events ?? []),
      create: vi.fn(),
      query: vi.fn(),
      appendEvent: vi.fn(),
      queryEvents: vi.fn(),
      materializeState: vi.fn(),
      createType: vi.fn(),
      getType: vi.fn(),
      getTypeByName: vi.fn(),
      listTypes: vi.fn(),
    },
  } as unknown as RepositoryContext;
}

// --- Default Event Reducer Tests ---

describe('defaultEventReducer', () => {
  it('handles created event', () => {
    const state = { existing: true };
    const event = createMockEvent('1', 'created', { title: 'New Entity', count: 0 });

    const result = defaultEventReducer(state, event);

    expect(result).toEqual({ existing: true, title: 'New Entity', count: 0 });
  });

  it('handles deleted event', () => {
    const state = { title: 'Entity', count: 5 };
    const event = createMockEvent('1', 'deleted', null);

    const result = defaultEventReducer(state, event);

    expect(result).toEqual({});
  });

  it('handles updated event', () => {
    const state = { title: 'Old Title', count: 5 };
    const event = createMockEvent('1', 'updated', { title: 'New Title' });

    const result = defaultEventReducer(state, event);

    expect(result).toEqual({ title: 'New Title', count: 5 });
  });

  it('handles *_changed events', () => {
    const state = { title: 'Old Title' };
    const event = createMockEvent('1', 'title_changed', { title: 'New Title' });

    const result = defaultEventReducer(state, event);

    expect(result).toEqual({ title: 'New Title' });
  });

  it('handles set_* events', () => {
    const state = { status: 'draft' };
    const event = createMockEvent('1', 'set_status', { status: 'published' });

    const result = defaultEventReducer(state, event);

    expect(result).toEqual({ status: 'published' });
  });

  it('merges unknown event types if data is object', () => {
    const state = { existing: true };
    const event = createMockEvent('1', 'custom_event', { newField: 'value' });

    const result = defaultEventReducer(state, event);

    expect(result).toEqual({ existing: true, newField: 'value' });
  });

  it('returns unchanged state for non-object data', () => {
    const state = { title: 'Test' };
    const event = createMockEvent('1', 'something', 'string value');

    const result = defaultEventReducer(state, event);

    expect(result).toEqual({ title: 'Test' });
  });
});

// --- Replay Entity Events Tests ---

describe('replayEntityEvents', () => {
  it('replays events in order to compute state', () => {
    const events = [
      createMockEvent('1', 'created', { title: 'Initial' }, '2024-01-01T00:00:00Z'),
      createMockEvent('2', 'title_changed', { title: 'Updated' }, '2024-01-02T00:00:00Z'),
      createMockEvent('3', 'updated', { count: 5 }, '2024-01-03T00:00:00Z'),
    ];

    const result = replayEntityEvents(events);

    expect(result.state).toEqual({ title: 'Updated', count: 5 });
    expect(result.eventsReplayed).toBe(3);
    expect(result.appliedEvents).toHaveLength(3);
    expect(result.errorEvents).toHaveLength(0);
  });

  it('sorts events by timestamp', () => {
    const events = [
      createMockEvent('2', 'title_changed', { title: 'Second' }, '2024-01-02T00:00:00Z'),
      createMockEvent('1', 'created', { title: 'First' }, '2024-01-01T00:00:00Z'),
      createMockEvent('3', 'title_changed', { title: 'Third' }, '2024-01-03T00:00:00Z'),
    ];

    const result = replayEntityEvents(events);

    // Events should be applied in timestamp order
    expect(result.appliedEvents[0].id).toBe('1');
    expect(result.appliedEvents[1].id).toBe('2');
    expect(result.appliedEvents[2].id).toBe('3');
    expect(result.state).toEqual({ title: 'Third' });
  });

  it('uses initial state if provided', () => {
    const events = [
      createMockEvent('1', 'updated', { count: 10 }),
    ];

    const result = replayEntityEvents(events, {
      initialState: { title: 'Pre-existing', count: 5 },
    });

    expect(result.state).toEqual({ title: 'Pre-existing', count: 10 });
  });

  it('uses custom reducer if provided', () => {
    const events = [
      createMockEvent('1', 'increment', { amount: 5 }),
      createMockEvent('2', 'increment', { amount: 3 }),
    ];

    const customReducer = (state: Record<string, unknown>, event: EntityEvent) => {
      if (event.type === 'increment') {
        const data = event.data as { amount: number };
        return { count: ((state.count as number) ?? 0) + data.amount };
      }
      return state;
    };

    const result = replayEntityEvents(events, { reducer: customReducer });

    expect(result.state).toEqual({ count: 8 });
  });

  it('captures reducer errors', () => {
    const events = [
      createMockEvent('1', 'created', { title: 'Test' }),
      createMockEvent('2', 'bad_event', null),
    ];

    const throwingReducer = (_state: Record<string, unknown>, event: EntityEvent) => {
      if (event.type === 'bad_event') {
        throw new Error('Cannot process bad_event');
      }
      return { title: 'Processed' };
    };

    const result = replayEntityEvents(events, { reducer: throwingReducer });

    expect(result.appliedEvents).toHaveLength(1);
    expect(result.errorEvents).toHaveLength(1);
    expect(result.errorEvents[0].event.id).toBe('2');
    expect(result.errorEvents[0].error.message).toBe('Cannot process bad_event');
  });

  it('handles empty events array', () => {
    const result = replayEntityEvents([]);

    expect(result.state).toEqual({});
    expect(result.eventsReplayed).toBe(0);
    expect(result.appliedEvents).toHaveLength(0);
  });
});

// --- Materialize Entity State Tests ---

describe('materializeEntityState', () => {
  it('returns null for non-existent entity', async () => {
    const repos = createMockRepos(null);

    const result = await materializeEntityState(repos, 'non-existent');

    expect(result).toBeNull();
  });

  it('materializes state from entity events', async () => {
    const events = [
      createMockEvent('1', 'created', { title: 'Test' }, '2024-01-01T00:00:00Z'),
      createMockEvent('2', 'updated', { count: 5 }, '2024-01-02T00:00:00Z'),
    ];
    const entity = createMockEntity({ title: 'Test', count: 5 }, events);
    const repos = createMockRepos(entity);

    const result = await materializeEntityState(repos, 'entity-1');

    expect(result).not.toBeNull();
    expect(result!.state).toEqual({ title: 'Test', count: 5 });
    expect(result!.eventsReplayed).toBe(2);
  });
});

// --- Verify Entity State Tests ---

describe('verifyEntityState', () => {
  it('returns matches=false for non-existent entity', async () => {
    const repos = createMockRepos(null);

    const result = await verifyEntityState(repos, 'non-existent');

    expect(result.matches).toBe(false);
    expect(result.entity).toBeNull();
    expect(result.differences).toContain('Entity not found');
  });

  it('returns matches=true when stored and computed state match', async () => {
    const events = [
      createMockEvent('1', 'created', { title: 'Test', count: 5 }),
    ];
    const entity = createMockEntity({ title: 'Test', count: 5 }, events);
    const repos = createMockRepos(entity);

    const result = await verifyEntityState(repos, 'entity-1');

    expect(result.matches).toBe(true);
    expect(result.differences).toHaveLength(0);
    expect(result.computedState).toEqual({ title: 'Test', count: 5 });
  });

  it('returns matches=false when states differ', async () => {
    const events = [
      createMockEvent('1', 'created', { title: 'Computed Title', count: 10 }),
    ];
    const entity = createMockEntity({ title: 'Stored Title', count: 5 }, events);
    const repos = createMockRepos(entity);

    const result = await verifyEntityState(repos, 'entity-1');

    expect(result.matches).toBe(false);
    expect(result.differences).toHaveLength(2);
    expect(result.differences.some((d) => d.includes('title'))).toBe(true);
    expect(result.differences.some((d) => d.includes('count'))).toBe(true);
  });

  it('detects missing keys in computed state', async () => {
    const events = [
      createMockEvent('1', 'created', { title: 'Test' }),
    ];
    const entity = createMockEntity({ title: 'Test', extraField: 'value' }, events);
    const repos = createMockRepos(entity);

    const result = await verifyEntityState(repos, 'entity-1');

    expect(result.matches).toBe(false);
    expect(result.differences.some((d) => d.includes('extraField'))).toBe(true);
  });
});

// --- Verify Entities (Batch) Tests ---

describe('verifyEntities', () => {
  it('verifies multiple entities', async () => {
    const events = [createMockEvent('1', 'created', { title: 'Test' })];
    const entity = createMockEntity({ title: 'Test' }, events);
    const repos = createMockRepos(entity);

    const result = await verifyEntities(repos, ['entity-1', 'entity-2', 'entity-3']);

    expect(result.totalVerified).toBe(3);
    expect(result.matchCount).toBe(3);
    expect(result.mismatchCount).toBe(0);
    expect(result.results.size).toBe(3);
  });

  it('counts mismatches correctly', async () => {
    // Track entities by ID - entity-3 will have a mismatch
    const repos = {
      entities: {
        get: vi.fn().mockImplementation((id: string) => {
          // First two entities match (entity-1, entity-2), third doesn't (entity-3)
          if (id === 'entity-1' || id === 'entity-2') {
            const events = [createMockEvent('1', 'created', { title: 'Test' })];
            return Promise.resolve(createMockEntity({ title: 'Test' }, events));
          } else {
            // entity-3: stored state has 'Test' but computed will have 'Different'
            const events = [createMockEvent('1', 'created', { title: 'Different' })];
            return Promise.resolve(createMockEntity({ title: 'Test' }, events));
          }
        }),
        getEvents: vi.fn().mockImplementation((id: string) => {
          if (id === 'entity-1' || id === 'entity-2') {
            return Promise.resolve([createMockEvent('1', 'created', { title: 'Test' })]);
          } else {
            // entity-3 will compute 'Different' from events
            return Promise.resolve([createMockEvent('1', 'created', { title: 'Different' })]);
          }
        }),
      },
    } as unknown as RepositoryContext;

    const result = await verifyEntities(repos, ['entity-1', 'entity-2', 'entity-3']);

    expect(result.totalVerified).toBe(3);
    expect(result.matchCount).toBe(2);
    expect(result.mismatchCount).toBe(1);
  });

  it('handles empty entity list', async () => {
    const repos = createMockRepos(null);

    const result = await verifyEntities(repos, []);

    expect(result.totalVerified).toBe(0);
    expect(result.matchCount).toBe(0);
    expect(result.mismatchCount).toBe(0);
  });
});
