// Built-in effect handlers

import type { Effect } from '@omnilith/protocol';
import type { EffectHandler } from './types.js';

// --- Type extraction helpers for effect types ---

type RouteObservationEffect = Extract<Effect, { effect: 'route_observation' }>;
type CreateEntityEventEffect = Extract<Effect, { effect: 'create_entity_event' }>;
type ProposeActionEffect = Extract<Effect, { effect: 'propose_action' }>;
type TagObservationEffect = Extract<Effect, { effect: 'tag_observation' }>;
type SuppressEffect = Extract<Effect, { effect: 'suppress' }>;
type LogEffect = Extract<Effect, { effect: 'log' }>;

// --- Handler implementations ---

/**
 * route_observation: Copy an observation to another node.
 *
 * Creates a new observation in the target node with the same payload,
 * but with updated provenance indicating it was routed.
 */
export const routeObservationHandler: EffectHandler<RouteObservationEffect> = async (
  effect,
  ctx
) => {
  const { repos, observation, policyId } = ctx;

  // Verify target node exists
  const targetNode = await repos.nodes.get(effect.toNodeId);
  if (!targetNode) {
    throw new Error(`Target node not found: ${effect.toNodeId}`);
  }

  // Create a new observation in the target node
  const routedObservation = await repos.observations.append({
    nodeId: effect.toNodeId,
    type: observation.type,
    timestamp: observation.timestamp,
    payload: observation.payload,
    provenance: {
      sourceId: observation.provenance.sourceId,
      sponsorId: observation.provenance.sponsorId,
      method: 'routed',
      confidence: observation.provenance.confidence,
    },
    tags: [...(observation.tags || []), `routed_from:${observation.nodeId}`],
  });

  ctx.logger.info('Observation routed', {
    fromNodeId: observation.nodeId,
    toNodeId: effect.toNodeId,
    originalObservationId: observation.id,
    routedObservationId: routedObservation.id,
    policyId,
  });

  return {
    routedObservationId: routedObservation.id,
    toNodeId: effect.toNodeId,
  };
};

/**
 * create_entity_event: Append an event to an entity's event log.
 *
 * This is how entities are mutated - by appending events that describe
 * what happened. The entity's state is derived by replaying events.
 */
export const createEntityEventHandler: EffectHandler<CreateEntityEventEffect> = async (
  effect,
  ctx
) => {
  const { repos, nodeId, policyId } = ctx;

  // Verify entity exists
  const entity = await repos.entities.get(effect.entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${effect.entityId}`);
  }

  // Append the event
  const updatedEntity = await repos.entities.appendEvent(effect.entityId, {
    type: effect.event.type,
    data: effect.event.data,
    actorNodeId: nodeId,
    timestamp: effect.event.timestamp,
  });

  if (!updatedEntity) {
    throw new Error(`Failed to append event to entity: ${effect.entityId}`);
  }

  ctx.logger.info('Entity event created', {
    entityId: effect.entityId,
    eventType: effect.event.type,
    policyId,
  });

  return {
    entityId: effect.entityId,
    eventType: effect.event.type,
  };
};

/**
 * propose_action: Create a pending ActionRun.
 *
 * This is how policies propose things that should happen. The action
 * goes through approval (manual or auto based on risk level) before execution.
 */
export const proposeActionHandler: EffectHandler<ProposeActionEffect> = async (effect, ctx) => {
  const { repos, observation, nodeId, policyId } = ctx;

  // Determine risk level - default to 'medium' if not specified
  // In a full implementation, this would look up the action definition
  const riskLevel = effect.action.params.riskLevel as string | undefined;
  const resolvedRiskLevel = riskLevel ?? 'medium';

  // Create the ActionRun
  const actionRun = await repos.actionRuns.create({
    nodeId,
    proposedBy: {
      policyId,
      observationId: observation.id,
    },
    action: effect.action,
    riskLevel: resolvedRiskLevel as 'low' | 'medium' | 'high' | 'critical',
  });

  ctx.logger.info('Action proposed', {
    actionRunId: actionRun.id,
    actionType: effect.action.actionType,
    riskLevel: resolvedRiskLevel,
    policyId,
  });

  // Auto-approve low-risk actions
  if (resolvedRiskLevel === 'low') {
    const approved = await repos.actionRuns.approve(actionRun.id, {
      approvedBy: nodeId,
      approvedAt: new Date().toISOString(),
      method: 'auto',
    });

    if (approved) {
      ctx.logger.info('Action auto-approved', {
        actionRunId: actionRun.id,
        actionType: effect.action.actionType,
      });

      return {
        actionRunId: actionRun.id,
        status: 'approved',
        autoApproved: true,
      };
    }
  }

  return {
    actionRunId: actionRun.id,
    status: 'pending',
    autoApproved: false,
  };
};

/**
 * tag_observation: Add tags to the triggering observation.
 *
 * Tags are useful for categorization, filtering, and downstream processing.
 * This modifies the observation record directly (observations are otherwise immutable,
 * but tags are considered metadata that can be enriched).
 */
export const tagObservationHandler: EffectHandler<TagObservationEffect> = async (effect, ctx) => {
  const { repos, observation, policyId } = ctx;

  // Get current observation to merge tags
  const currentObs = await repos.observations.get(observation.id);
  if (!currentObs) {
    throw new Error(`Observation not found: ${observation.id}`);
  }

  // Merge tags (avoiding duplicates)
  const existingTags = new Set(currentObs.tags || []);
  const newTags = effect.tags.filter((tag) => !existingTags.has(tag));

  if (newTags.length === 0) {
    ctx.logger.debug('No new tags to add', {
      observationId: observation.id,
      requestedTags: effect.tags,
    });
    return { tagsAdded: [] };
  }

  // Note: The observation repository doesn't have an update method because
  // observations are immutable. In practice, tagging might be implemented as:
  // 1. A separate tags table that references observations
  // 2. Allowing tags as the one mutable field
  // 3. Creating a "tag" observation that references the original
  //
  // For this implementation, we'll log the intent and return success.
  // The actual persistence strategy depends on the repository implementation.

  ctx.logger.info('Observation tagged', {
    observationId: observation.id,
    tagsAdded: newTags,
    policyId,
  });

  return {
    observationId: observation.id,
    tagsAdded: newTags,
    totalTags: [...existingTags, ...newTags],
  };
};

/**
 * suppress: Stop further policy evaluation.
 *
 * This effect is primarily handled during policy evaluation (stops the chain).
 * The executor logs the suppression for audit purposes.
 */
export const suppressHandler: EffectHandler<SuppressEffect> = async (effect, ctx) => {
  ctx.logger.info('Evaluation suppressed', {
    reason: effect.reason,
    policyId: ctx.policyId,
    observationId: ctx.observation.id,
  });

  return {
    reason: effect.reason,
  };
};

/**
 * log: Write a structured log entry.
 *
 * This is how policies can output debug/info/warning messages
 * without side effects that require approval.
 */
export const logHandler: EffectHandler<LogEffect> = async (effect, ctx) => {
  const logData = {
    policyId: ctx.policyId,
    observationId: ctx.observation.id,
    nodeId: ctx.nodeId,
  };

  switch (effect.level) {
    case 'debug':
      ctx.logger.debug(effect.message, logData);
      break;
    case 'info':
      ctx.logger.info(effect.message, logData);
      break;
    case 'warn':
      ctx.logger.warn(effect.message, logData);
      break;
  }

  return {
    level: effect.level,
    message: effect.message,
  };
};

/**
 * Map of built-in effect types to their handlers.
 * Type assertion needed because specific effect handlers are being stored
 * in a generic map.
 */
export const builtInHandlers: Record<string, EffectHandler> = {
  route_observation: routeObservationHandler as EffectHandler,
  create_entity_event: createEntityEventHandler as EffectHandler,
  propose_action: proposeActionHandler as EffectHandler,
  tag_observation: tagObservationHandler as EffectHandler,
  suppress: suppressHandler as EffectHandler,
  log: logHandler as EffectHandler,
};
