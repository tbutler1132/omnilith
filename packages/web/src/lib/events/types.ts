// Event types for real-time subscriptions
//
// These events are published when canon changes occur and can be
// subscribed to via the SSE endpoint.

import type { Id } from '@omnilith/protocol';

/**
 * All possible event types in the system.
 */
export type EventType =
  | 'observation.created'
  | 'artifact.created'
  | 'artifact.updated'
  | 'artifact.statusChanged'
  | 'artifact.deleted'
  | 'episode.created'
  | 'episode.updated'
  | 'episode.statusChanged'
  | 'variable.created'
  | 'variable.updated'
  | 'variable.deleted'
  | 'variable.estimate.updated'
  | 'actionRun.created'
  | 'actionRun.statusChanged'
  | 'surface.created'
  | 'surface.updated'
  | 'surface.deleted'
  | 'entity.created'
  | 'entity.eventAppended'
  | 'policy.created'
  | 'policy.updated'
  | 'policy.deleted'
  | 'grant.created'
  | 'grant.revoked';

/**
 * Base event structure.
 */
export type BaseEvent = {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: EventType;
  /** When the event occurred */
  timestamp: string;
  /** The node where this event occurred */
  nodeId: Id;
};

/**
 * Event published when an observation is created.
 */
export type ObservationCreatedEvent = BaseEvent & {
  type: 'observation.created';
  payload: {
    observationId: Id;
    observationType: string;
  };
};

/**
 * Event published when an artifact is created.
 */
export type ArtifactCreatedEvent = BaseEvent & {
  type: 'artifact.created';
  payload: {
    artifactId: Id;
    title: string;
  };
};

/**
 * Event published when an artifact is updated.
 */
export type ArtifactUpdatedEvent = BaseEvent & {
  type: 'artifact.updated';
  payload: {
    artifactId: Id;
    version: number;
  };
};

/**
 * Event published when an artifact status changes.
 */
export type ArtifactStatusChangedEvent = BaseEvent & {
  type: 'artifact.statusChanged';
  payload: {
    artifactId: Id;
    status: string;
  };
};

/**
 * Event published when an artifact is deleted.
 */
export type ArtifactDeletedEvent = BaseEvent & {
  type: 'artifact.deleted';
  payload: {
    artifactId: Id;
  };
};

/**
 * Event published when an episode is created.
 */
export type EpisodeCreatedEvent = BaseEvent & {
  type: 'episode.created';
  payload: {
    episodeId: Id;
    title: string;
    kind: string;
  };
};

/**
 * Event published when an episode is updated.
 */
export type EpisodeUpdatedEvent = BaseEvent & {
  type: 'episode.updated';
  payload: {
    episodeId: Id;
  };
};

/**
 * Event published when an episode status changes.
 */
export type EpisodeStatusChangedEvent = BaseEvent & {
  type: 'episode.statusChanged';
  payload: {
    episodeId: Id;
    status: string;
  };
};

/**
 * Event published when a variable is created.
 */
export type VariableCreatedEvent = BaseEvent & {
  type: 'variable.created';
  payload: {
    variableId: Id;
    key: string;
  };
};

/**
 * Event published when a variable is updated.
 */
export type VariableUpdatedEvent = BaseEvent & {
  type: 'variable.updated';
  payload: {
    variableId: Id;
  };
};

/**
 * Event published when a variable is deleted.
 */
export type VariableDeletedEvent = BaseEvent & {
  type: 'variable.deleted';
  payload: {
    variableId: Id;
  };
};

/**
 * Event published when a variable estimate is updated.
 */
export type VariableEstimateUpdatedEvent = BaseEvent & {
  type: 'variable.estimate.updated';
  payload: {
    variableId: Id;
    value: number | string | boolean;
  };
};

/**
 * Event published when an action run is created.
 */
export type ActionRunCreatedEvent = BaseEvent & {
  type: 'actionRun.created';
  payload: {
    actionRunId: Id;
    actionType: string;
    riskLevel: string;
  };
};

/**
 * Event published when an action run status changes.
 */
export type ActionRunStatusChangedEvent = BaseEvent & {
  type: 'actionRun.statusChanged';
  payload: {
    actionRunId: Id;
    status: string;
    previousStatus?: string;
  };
};

/**
 * Event published when a surface is created.
 */
export type SurfaceCreatedEvent = BaseEvent & {
  type: 'surface.created';
  payload: {
    surfaceId: Id;
    kind: string;
  };
};

/**
 * Event published when a surface is updated.
 */
export type SurfaceUpdatedEvent = BaseEvent & {
  type: 'surface.updated';
  payload: {
    surfaceId: Id;
  };
};

/**
 * Event published when a surface is deleted.
 */
export type SurfaceDeletedEvent = BaseEvent & {
  type: 'surface.deleted';
  payload: {
    surfaceId: Id;
  };
};

/**
 * Event published when an entity is created.
 */
export type EntityCreatedEvent = BaseEvent & {
  type: 'entity.created';
  payload: {
    entityId: Id;
    typeId: Id;
  };
};

/**
 * Event published when an entity event is appended.
 */
export type EntityEventAppendedEvent = BaseEvent & {
  type: 'entity.eventAppended';
  payload: {
    entityId: Id;
    eventType: string;
  };
};

/**
 * Event published when a policy is created.
 */
export type PolicyCreatedEvent = BaseEvent & {
  type: 'policy.created';
  payload: {
    policyId: Id;
    name: string;
  };
};

/**
 * Event published when a policy is updated.
 */
export type PolicyUpdatedEvent = BaseEvent & {
  type: 'policy.updated';
  payload: {
    policyId: Id;
  };
};

/**
 * Event published when a policy is deleted.
 */
export type PolicyDeletedEvent = BaseEvent & {
  type: 'policy.deleted';
  payload: {
    policyId: Id;
  };
};

/**
 * Event published when a grant is created.
 */
export type GrantCreatedEvent = BaseEvent & {
  type: 'grant.created';
  payload: {
    grantId: Id;
    granteeNodeId: Id;
  };
};

/**
 * Event published when a grant is revoked.
 */
export type GrantRevokedEvent = BaseEvent & {
  type: 'grant.revoked';
  payload: {
    grantId: Id;
    reason?: string;
  };
};

/**
 * Union of all event types.
 */
export type SystemEvent =
  | ObservationCreatedEvent
  | ArtifactCreatedEvent
  | ArtifactUpdatedEvent
  | ArtifactStatusChangedEvent
  | ArtifactDeletedEvent
  | EpisodeCreatedEvent
  | EpisodeUpdatedEvent
  | EpisodeStatusChangedEvent
  | VariableCreatedEvent
  | VariableUpdatedEvent
  | VariableDeletedEvent
  | VariableEstimateUpdatedEvent
  | ActionRunCreatedEvent
  | ActionRunStatusChangedEvent
  | SurfaceCreatedEvent
  | SurfaceUpdatedEvent
  | SurfaceDeletedEvent
  | EntityCreatedEvent
  | EntityEventAppendedEvent
  | PolicyCreatedEvent
  | PolicyUpdatedEvent
  | PolicyDeletedEvent
  | GrantCreatedEvent
  | GrantRevokedEvent;

/**
 * Handler function for events.
 */
export type EventHandler = (event: SystemEvent) => void | Promise<void>;
