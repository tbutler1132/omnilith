// Entity Event Replay
//
// Rebuilds entity state by replaying events.
// Entities are event-sourced: state is computed by replaying events.
// This provides full history and auditability.

import type { Entity, EntityEvent, Id } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';

/**
 * Options for replaying entity events
 */
export type ReplayEntityEventsOptions = {
  /**
   * Initial state to start from (default: empty object)
   */
  initialState?: Record<string, unknown>;

  /**
   * State reducer function.
   * Default implementation applies event.data to state using shallow merge.
   */
  reducer?: (state: Record<string, unknown>, event: EntityEvent) => Record<string, unknown>;

  /**
   * Whether to validate events against entity type schema
   */
  validateEvents?: boolean;
};

/**
 * Result of replaying entity events
 */
export type ReplayEntityEventsResult = {
  /**
   * The final computed state
   */
  state: Record<string, unknown>;

  /**
   * Number of events replayed
   */
  eventsReplayed: number;

  /**
   * Events that were applied (in order)
   */
  appliedEvents: EntityEvent[];

  /**
   * Events that caused errors (if any)
   */
  errorEvents: Array<{ event: EntityEvent; error: Error }>;

  /**
   * Time taken to replay in milliseconds
   */
  durationMs: number;
};

/**
 * Default event reducer that applies event data to state.
 *
 * Handles common event types:
 * - 'created': Sets initial state from event.data
 * - 'updated', '*_changed', 'set_*': Merges event.data into state
 * - 'deleted': Returns empty state
 *
 * @param state - Current state
 * @param event - Event to apply
 * @returns New state
 */
export function defaultEventReducer(
  state: Record<string, unknown>,
  event: EntityEvent
): Record<string, unknown> {
  const eventType = event.type.toLowerCase();

  // Created event - use data as initial state
  if (eventType === 'created') {
    if (typeof event.data === 'object' && event.data !== null) {
      return { ...state, ...(event.data as Record<string, unknown>) };
    }
    return state;
  }

  // Deleted event - return empty state
  if (eventType === 'deleted') {
    return {};
  }

  // Update events - merge data into state
  if (
    eventType === 'updated' ||
    eventType.endsWith('_changed') ||
    eventType.endsWith('_updated') ||
    eventType.startsWith('set_')
  ) {
    if (typeof event.data === 'object' && event.data !== null) {
      return { ...state, ...(event.data as Record<string, unknown>) };
    }
    return state;
  }

  // Field-specific events (e.g., 'title_changed' with { title: 'new value' })
  // These are handled by the generic merge above

  // For unknown event types, try to merge if data is an object
  if (typeof event.data === 'object' && event.data !== null) {
    return { ...state, ...(event.data as Record<string, unknown>) };
  }

  // Can't apply this event - return unchanged state
  return state;
}

/**
 * Replay entity events to compute the final state.
 *
 * Entities are event-sourced: their state is the result of applying
 * all events in order. This function replays events to reconstruct state.
 *
 * @param events - Events to replay (should be sorted by timestamp)
 * @param options - Replay options
 * @returns Computed state and replay metadata
 *
 * @example
 * ```typescript
 * // Get entity events from repository
 * const events = await repos.entities.getEvents(entityId);
 *
 * // Replay to verify state matches
 * const result = replayEntityEvents(events);
 *
 * // Compare with stored state
 * const entity = await repos.entities.get(entityId);
 * expect(result.state).toEqual(entity.state);
 * ```
 */
export function replayEntityEvents(
  events: EntityEvent[],
  options: ReplayEntityEventsOptions = {}
): ReplayEntityEventsResult {
  const startTime = Date.now();
  const { initialState = {}, reducer = defaultEventReducer } = options;

  let state = { ...initialState };
  const appliedEvents: EntityEvent[] = [];
  const errorEvents: Array<{ event: EntityEvent; error: Error }> = [];

  // Sort events by timestamp to ensure correct order
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const event of sortedEvents) {
    try {
      state = reducer(state, event);
      appliedEvents.push(event);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorEvents.push({ event, error: err });
    }
  }

  return {
    state,
    eventsReplayed: sortedEvents.length,
    appliedEvents,
    errorEvents,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Materialize entity state from the repository.
 *
 * Fetches the entity's events and replays them to compute state.
 * Useful for verifying that stored state matches computed state.
 *
 * @param repos - Repository context
 * @param entityId - Entity ID to materialize
 * @param options - Replay options
 * @returns Computed state or null if entity not found
 */
export async function materializeEntityState(
  repos: RepositoryContext,
  entityId: Id,
  options: ReplayEntityEventsOptions = {}
): Promise<ReplayEntityEventsResult | null> {
  // Get entity to check it exists
  const entity = await repos.entities.get(entityId);
  if (!entity) {
    return null;
  }

  // Get events
  const events = await repos.entities.getEvents(entityId);

  // Replay events
  return replayEntityEvents(events, options);
}

/**
 * Verify that an entity's stored state matches its computed state.
 *
 * This is a determinism check: if events are replayed correctly,
 * the computed state should match the stored state.
 *
 * @param repos - Repository context
 * @param entityId - Entity ID to verify
 * @param options - Replay options
 * @returns Verification result
 */
export async function verifyEntityState(
  repos: RepositoryContext,
  entityId: Id,
  options: ReplayEntityEventsOptions = {}
): Promise<{
  matches: boolean;
  entity: Entity | null;
  computedState: Record<string, unknown> | null;
  differences: string[];
}> {
  const entity = await repos.entities.get(entityId);
  if (!entity) {
    return {
      matches: false,
      entity: null,
      computedState: null,
      differences: ['Entity not found'],
    };
  }

  const result = await materializeEntityState(repos, entityId, options);
  if (!result) {
    return {
      matches: false,
      entity,
      computedState: null,
      differences: ['Could not materialize state'],
    };
  }

  const differences: string[] = [];
  const storedState = entity.state;
  const computedState = result.state;

  // Check for differences
  const allKeys = new Set([...Object.keys(storedState), ...Object.keys(computedState)]);
  for (const key of allKeys) {
    const storedValue = storedState[key];
    const computedValue = computedState[key];

    if (JSON.stringify(storedValue) !== JSON.stringify(computedValue)) {
      differences.push(
        `Key '${key}': stored=${JSON.stringify(storedValue)}, computed=${JSON.stringify(computedValue)}`
      );
    }
  }

  return {
    matches: differences.length === 0,
    entity,
    computedState,
    differences,
  };
}

/**
 * Batch verify multiple entities.
 *
 * @param repos - Repository context
 * @param entityIds - Entity IDs to verify
 * @param options - Replay options
 * @returns Verification results for all entities
 */
export async function verifyEntities(
  repos: RepositoryContext,
  entityIds: Id[],
  options: ReplayEntityEventsOptions = {}
): Promise<{
  totalVerified: number;
  matchCount: number;
  mismatchCount: number;
  results: Map<
    Id,
    {
      matches: boolean;
      differences: string[];
    }
  >;
}> {
  const results = new Map<Id, { matches: boolean; differences: string[] }>();
  let matchCount = 0;
  let mismatchCount = 0;

  for (const entityId of entityIds) {
    const result = await verifyEntityState(repos, entityId, options);
    results.set(entityId, {
      matches: result.matches,
      differences: result.differences,
    });

    if (result.matches) {
      matchCount++;
    } else {
      mismatchCount++;
    }
  }

  return {
    totalVerified: entityIds.length,
    matchCount,
    mismatchCount,
    results,
  };
}
