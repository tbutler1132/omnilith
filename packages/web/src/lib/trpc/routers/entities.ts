// Entities router - CRUD for entities and events

import { z } from 'zod';
import type { Entity, EntityEventPayload } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure } from '../middleware';
import { createEvent } from '../../events/bus';

// Zod schema for entity event payload with explicit type to match protocol
const EntityEventPayloadSchema: z.ZodType<EntityEventPayload> = z.object({
  type: z.string(),
  data: z.any(),
  timestamp: z.string().optional(),
}) as z.ZodType<EntityEventPayload>;

export const entitiesRouter = router({
  /**
   * Get an entity by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const entity = await ctx.repos.entities.get(input.id);
      if (!entity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Entity not found: ${input.id}`,
        });
      }
      return entity;
    }),

  /**
   * List entities for a node.
   */
  list: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        typeId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const entities = await ctx.repos.entities.query({
        nodeId: input.nodeId,
        typeId: input.typeId,
        limit: input.limit,
        offset: input.offset,
      });
      return entities;
    }),

  /**
   * Get events for an entity.
   */
  getEvents: publicProcedure
    .input(
      z.object({
        entityId: z.string(),
        limit: z.number().min(1).max(1000).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const events = await ctx.repos.entities.getEvents(input.entityId);
      return events;
    }),

  /**
   * Get entity type definition.
   */
  getEntityType: publicProcedure
    .input(z.object({ typeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entityType = await ctx.repos.entities.getType(input.typeId);
      if (!entityType) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Entity type not found: ${input.typeId}`,
        });
      }
      return entityType;
    }),

  /**
   * Create a new entity.
   */
  create: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        id: z.string().optional(),
        typeId: z.string(),
        initialState: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_entity',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        nodeId: input.nodeId,
        entity: {
          id: input.id,
          typeId: input.typeId,
          initialState: input.initialState,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create entity',
        });
      }

      const data = result.data as { entity: Entity };

      // Publish event
      const event = createEvent('entity.created', input.nodeId, {
        entityId: data.entity.id,
        typeId: data.entity.typeId,
      });
      await ctx.eventBus.publish(event);

      return data.entity;
    }),

  /**
   * Append an event to an entity.
   */
  appendEvent: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        event: EntityEventPayloadSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current entity to find nodeId for event
      const current = await ctx.repos.entities.get(input.entityId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Entity not found: ${input.entityId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'append_entity_event',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        entityId: input.entityId,
        event: input.event,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to append entity event',
        });
      }

      const data = result.data as { entity: Entity };

      // Publish event
      const event = createEvent('entity.eventAppended', current.nodeId, {
        entityId: data.entity.id,
        eventType: input.event.type,
      });
      await ctx.eventBus.publish(event);

      return data.entity;
    }),
});
