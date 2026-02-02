// Policies router - CRUD for policies

import { z } from 'zod';
import type { Policy } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure } from '../middleware';
import { createEvent } from '../../events/bus';

// Zod schema for policy trigger
const TriggerSchema = z.object({
  observationType: z.string().optional(),
  observationTypePrefix: z.string().optional(),
});

export const policiesRouter = router({
  /**
   * Get a policy by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const policy = await ctx.repos.policies.get(input.id);
      if (!policy) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Policy not found: ${input.id}`,
        });
      }
      return policy;
    }),

  /**
   * List policies for a node.
   */
  list: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        enabled: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const policies = await ctx.repos.policies.list({
        nodeId: input.nodeId,
        enabled: input.enabled,
        limit: input.limit,
        offset: input.offset,
      });
      return policies;
    }),

  /**
   * Create a new policy.
   */
  create: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        id: z.string().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        priority: z.number().int().min(0).max(1000).default(100),
        enabled: z.boolean().default(true),
        trigger: TriggerSchema,
        evaluatorCode: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_policy',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        nodeId: input.nodeId,
        policy: {
          id: input.id,
          name: input.name,
          description: input.description,
          priority: input.priority,
          enabled: input.enabled,
          trigger: input.trigger,
          evaluatorCode: input.evaluatorCode,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create policy',
        });
      }

      const data = result.data as { policy: Policy };

      // Publish event
      const event = createEvent('policy.created', input.nodeId, {
        policyId: data.policy.id,
        name: data.policy.name,
      });
      await ctx.eventBus.publish(event);

      return data.policy;
    }),

  /**
   * Update a policy.
   */
  update: protectedProcedure
    .input(
      z.object({
        policyId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        priority: z.number().int().min(0).max(1000).optional(),
        enabled: z.boolean().optional(),
        trigger: TriggerSchema.optional(),
        evaluatorCode: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current policy to find nodeId for event
      const current = await ctx.repos.policies.get(input.policyId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Policy not found: ${input.policyId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'update_policy',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        policyId: input.policyId,
        updates: {
          name: input.name,
          description: input.description,
          priority: input.priority,
          enabled: input.enabled,
          trigger: input.trigger,
          evaluatorCode: input.evaluatorCode,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update policy',
        });
      }

      const data = result.data as { policy: Policy };

      // Publish event
      const event = createEvent('policy.updated', current.nodeId, {
        policyId: data.policy.id,
      });
      await ctx.eventBus.publish(event);

      return data.policy;
    }),

  /**
   * Delete a policy.
   */
  delete: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get current policy to find nodeId for event
      const current = await ctx.repos.policies.get(input.policyId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Policy not found: ${input.policyId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'delete_policy',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        policyId: input.policyId,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to delete policy',
        });
      }

      // Publish event
      const event = createEvent('policy.deleted', current.nodeId, {
        policyId: input.policyId,
      });
      await ctx.eventBus.publish(event);

      return { success: true };
    }),
});
