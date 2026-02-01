// Core Action Handlers
//
// These are the built-in action handlers for common operations.
// Each handler receives action params and an execution context,
// and returns a result that gets recorded in the ActionRun.

import type {
  ActionDefinition,
  ArtifactStatus,
  EpisodeStatus,
  EpisodeKind,
  EpisodeIntent,
  VariableKind,
  ResourceType,
  GrantScope,
  PageDoc,
} from '@omnilith/protocol';
import type { ActionHandler } from './lifecycle.js';

// --- Create Artifact ---

export const createArtifactDefinition: ActionDefinition = {
  actionType: 'create_artifact',
  name: 'Create Artifact',
  description: 'Create a new artifact (document, note, etc.)',
  riskLevel: 'low',
  paramsSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Artifact title' },
      about: { type: 'string', description: 'What the artifact is about' },
      status: { type: 'string', enum: ['draft', 'active', 'published', 'archived'] },
      page: { type: 'object', description: 'PageDoc content' },
      entityRefs: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'about'],
  },
};

export const createArtifactHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;

  const page: PageDoc = (params.page as PageDoc) || { version: 1, blocks: [] };

  const artifact = await repos.artifacts.create(
    {
      nodeId: node.id,
      title: params.title as string,
      about: params.about as string,
      page,
      status: (params.status as ArtifactStatus) || 'draft',
      entityRefs: params.entityRefs as string[] | undefined,
    },
    {
      authorNodeId: node.id,
      message: 'Created via action',
    }
  );

  return {
    artifactId: artifact.id,
    status: artifact.status,
  };
};

// --- Update Artifact ---

export const updateArtifactDefinition: ActionDefinition = {
  actionType: 'update_artifact',
  name: 'Update Artifact',
  description: 'Update an existing artifact (creates new revision)',
  riskLevel: 'low',
  paramsSchema: {
    type: 'object',
    properties: {
      artifactId: { type: 'string', description: 'ID of the artifact to update' },
      title: { type: 'string' },
      about: { type: 'string' },
      page: { type: 'object' },
    },
    required: ['artifactId'],
  },
};

export const updateArtifactHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;
  const artifactId = params.artifactId as string;

  const existing = await repos.artifacts.get(artifactId);
  if (!existing) {
    throw new Error(`Artifact not found: ${artifactId}`);
  }

  const updates: Record<string, unknown> = {};
  if (params.title !== undefined) updates.title = params.title;
  if (params.about !== undefined) updates.about = params.about;
  if (params.page !== undefined) updates.page = params.page;

  const updated = await repos.artifacts.update(
    artifactId,
    updates,
    {
      authorNodeId: node.id,
      message: 'Updated via action',
    }
  );

  return {
    artifactId: updated?.id,
    revisionVersion: updated?.trunkVersion,
  };
};

// --- Update Artifact Status ---

export const updateArtifactStatusDefinition: ActionDefinition = {
  actionType: 'update_artifact_status',
  name: 'Update Artifact Status',
  description: 'Change artifact status (draft, active, published, archived)',
  riskLevel: 'medium', // Status changes can affect visibility
  paramsSchema: {
    type: 'object',
    properties: {
      artifactId: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'active', 'published', 'archived'] },
    },
    required: ['artifactId', 'status'],
  },
};

export const updateArtifactStatusHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;
  const artifactId = params.artifactId as string;
  const status = params.status as ArtifactStatus;

  const updated = await repos.artifacts.updateStatus(artifactId, status, node.id);

  return {
    artifactId: updated?.id,
    newStatus: status,
  };
};

// --- Create Episode ---

export const createEpisodeDefinition: ActionDefinition = {
  actionType: 'create_episode',
  name: 'Create Episode',
  description: 'Create a new episode (intervention period)',
  riskLevel: 'medium', // Episodes affect system behavior
  paramsSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      kind: { type: 'string', enum: ['regulatory', 'exploratory'] },
      variables: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            variableId: { type: 'string' },
            intent: { type: 'string' },
          },
        },
      },
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time' },
      relatedArtifactIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'kind', 'variables'],
  },
};

export const createEpisodeHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;

  const episode = await repos.episodes.create({
    nodeId: node.id,
    title: params.title as string,
    description: params.description as string | undefined,
    kind: params.kind as EpisodeKind,
    variables: params.variables as Array<{ variableId: string; intent: EpisodeIntent }>,
    status: 'planned',
    startsAt: params.startsAt as string | undefined,
    endsAt: params.endsAt as string | undefined,
    relatedArtifactIds: params.relatedArtifactIds as string[] | undefined,
  });

  return {
    episodeId: episode.id,
    status: episode.status,
  };
};

// --- Update Episode Status ---

export const updateEpisodeStatusDefinition: ActionDefinition = {
  actionType: 'update_episode_status',
  name: 'Update Episode Status',
  description: 'Change episode status (planned, active, completed, abandoned)',
  riskLevel: 'medium',
  paramsSchema: {
    type: 'object',
    properties: {
      episodeId: { type: 'string' },
      status: { type: 'string', enum: ['planned', 'active', 'completed', 'abandoned'] },
    },
    required: ['episodeId', 'status'],
  },
};

export const updateEpisodeStatusHandler: ActionHandler = async (params, ctx) => {
  const { repos } = ctx;
  const episodeId = params.episodeId as string;
  const status = params.status as EpisodeStatus;

  const updated = await repos.episodes.updateStatus(episodeId, status);

  return {
    episodeId: updated?.id,
    newStatus: status,
  };
};

// --- Create Entity ---

export const createEntityDefinition: ActionDefinition = {
  actionType: 'create_entity',
  name: 'Create Entity',
  description: 'Create a new entity (durable referent)',
  riskLevel: 'low',
  paramsSchema: {
    type: 'object',
    properties: {
      typeId: { type: 'string', description: 'Entity type ID' },
      initialState: { type: 'object', description: 'Initial state object' },
    },
    required: ['typeId'],
  },
};

export const createEntityHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;

  const entity = await repos.entities.create(
    {
      nodeId: node.id,
      typeId: params.typeId as string,
      initialState: (params.initialState as Record<string, unknown>) || {},
    },
    node.id
  );

  return {
    entityId: entity.id,
    typeId: entity.typeId,
  };
};

// --- Create Entity Event ---

export const createEntityEventDefinition: ActionDefinition = {
  actionType: 'create_entity_event',
  name: 'Create Entity Event',
  description: 'Append an event to an entity (event-sourced mutation)',
  riskLevel: 'low',
  paramsSchema: {
    type: 'object',
    properties: {
      entityId: { type: 'string' },
      event: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          data: { type: 'object' },
        },
        required: ['type'],
      },
    },
    required: ['entityId', 'event'],
  },
};

export const createEntityEventHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;
  const entityId = params.entityId as string;
  const event = params.event as { type: string; data?: Record<string, unknown> };

  const entity = await repos.entities.appendEvent(entityId, {
    type: event.type,
    data: event.data || {},
    actorNodeId: node.id,
    timestamp: new Date().toISOString(),
  });

  return {
    entityId: entity?.id,
    eventType: event.type,
  };
};

// --- Create Variable ---

export const createVariableDefinition: ActionDefinition = {
  actionType: 'create_variable',
  name: 'Create Variable',
  description: 'Create a new variable to track',
  riskLevel: 'medium', // Variables affect regulation
  paramsSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Unique key for the variable' },
      title: { type: 'string' },
      description: { type: 'string' },
      kind: { type: 'string', enum: ['continuous', 'discrete', 'boolean'] },
      unit: { type: 'string' },
      viableRange: {
        type: 'object',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' },
        },
      },
      preferredRange: {
        type: 'object',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' },
        },
      },
    },
    required: ['key', 'title', 'kind'],
  },
};

export const createVariableHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;

  const variable = await repos.variables.create({
    nodeId: node.id,
    key: params.key as string,
    title: params.title as string,
    description: params.description as string | undefined,
    kind: params.kind as VariableKind,
    unit: params.unit as string | undefined,
    viableRange: params.viableRange as { min?: number; max?: number } | undefined,
    preferredRange: params.preferredRange as { min?: number; max?: number } | undefined,
  });

  return {
    variableId: variable.id,
    key: variable.key,
  };
};

// --- Create Grant ---

export const createGrantDefinition: ActionDefinition = {
  actionType: 'create_grant',
  name: 'Create Grant',
  description: 'Grant access to a resource',
  riskLevel: 'high', // Access control is sensitive
  paramsSchema: {
    type: 'object',
    properties: {
      granteeNodeId: { type: 'string' },
      resourceType: { type: 'string', enum: ['artifact', 'variable', 'episode', 'entity', 'surface', 'node'] },
      resourceId: { type: 'string' },
      scopes: { type: 'array', items: { type: 'string' } },
      expiresAt: { type: 'string', format: 'date-time' },
    },
    required: ['granteeNodeId', 'resourceType', 'resourceId', 'scopes'],
  },
};

export const createGrantHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;

  const grant = await repos.grants.create({
    grantorNodeId: node.id,
    granteeNodeId: params.granteeNodeId as string,
    resourceType: params.resourceType as ResourceType,
    resourceId: params.resourceId as string,
    scopes: params.scopes as GrantScope[],
    expiresAt: params.expiresAt as string | undefined,
  });

  return {
    grantId: grant.id,
    granteeNodeId: grant.granteeNodeId,
    scopes: grant.scopes,
  };
};

// --- Revoke Grant ---

export const revokeGrantDefinition: ActionDefinition = {
  actionType: 'revoke_grant',
  name: 'Revoke Grant',
  description: 'Revoke access to a resource',
  riskLevel: 'high',
  paramsSchema: {
    type: 'object',
    properties: {
      grantId: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['grantId'],
  },
};

export const revokeGrantHandler: ActionHandler = async (params, ctx) => {
  const { repos, node } = ctx;
  const grantId = params.grantId as string;
  const reason = params.reason as string | undefined;

  const grant = await repos.grants.revoke(grantId, {
    revokedBy: node.id,
    reason,
  });

  return {
    grantId,
    revoked: grant !== null,
  };
};

// --- Registry of all core actions ---

export const coreActionDefinitions: ActionDefinition[] = [
  createArtifactDefinition,
  updateArtifactDefinition,
  updateArtifactStatusDefinition,
  createEpisodeDefinition,
  updateEpisodeStatusDefinition,
  createEntityDefinition,
  createEntityEventDefinition,
  createVariableDefinition,
  createGrantDefinition,
  revokeGrantDefinition,
];

export const coreActionHandlers: Record<string, ActionHandler> = {
  create_artifact: createArtifactHandler,
  update_artifact: updateArtifactHandler,
  update_artifact_status: updateArtifactStatusHandler,
  create_episode: createEpisodeHandler,
  update_episode_status: updateEpisodeStatusHandler,
  create_entity: createEntityHandler,
  create_entity_event: createEntityEventHandler,
  create_variable: createVariableHandler,
  create_grant: createGrantHandler,
  revoke_grant: revokeGrantHandler,
};

/**
 * Register all core actions with an action registry
 */
export function registerCoreActions(
  registry: {
    register(definition: ActionDefinition, handler: ActionHandler): void;
  }
): void {
  for (const definition of coreActionDefinitions) {
    const handler = coreActionHandlers[definition.actionType];
    if (handler) {
      registry.register(definition, handler);
    }
  }
}
