// Variables router - CRUD for variables and estimates

import { z } from 'zod';
import type { Variable } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure } from '../middleware';
import { createEvent } from '../../events/bus';
import { deriveEstimate } from '@omnilith/runtime';

// Default time window for observation queries
const DEFAULT_TIME_WINDOW_HOURS = 24;

// Zod schemas for variable types
const ViableRangeSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  categories: z.array(z.string()).optional(),
});

// ComputeSpec schema - use z.any() for flexibility since full validation is complex
// Types are enforced by the protocol layer
const ComputeSpecSchema = z.any();

export const variablesRouter = router({
  /**
   * Get a variable by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const variable = await ctx.repos.variables.get(input.id);
      if (!variable) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Variable not found: ${input.id}`,
        });
      }
      return variable;
    }),

  /**
   * List variables for a node.
   */
  list: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        kind: z.enum(['continuous', 'ordinal', 'categorical', 'boolean']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const variables = await ctx.repos.variables.list({
        nodeId: input.nodeId,
        kind: input.kind,
        limit: input.limit,
        offset: input.offset,
      });
      return variables;
    }),

  /**
   * Get the current estimate for a variable.
   * Derives the estimate from observations using the variable's compute specs.
   */
  getEstimate: publicProcedure
    .input(
      z.object({
        variableId: z.string(),
        forceRefresh: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const variable = await ctx.repos.variables.get(input.variableId);
      if (!variable) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Variable not found: ${input.variableId}`,
        });
      }

      // Fetch recent observations for the node
      const observations = await ctx.repos.observations.query({
        nodeId: variable.nodeId,
        window: { hours: DEFAULT_TIME_WINDOW_HOURS },
        limit: 1000,
      });

      // Derive estimate from observations
      const estimate = deriveEstimate(variable, observations);
      return estimate;
    }),

  /**
   * Get estimates for multiple variables.
   */
  getEstimates: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        variableIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get variables
      let variables;
      if (input.variableIds) {
        const results = await Promise.all(
          input.variableIds.map((id) => ctx.repos.variables.get(id))
        );
        variables = results.filter((v): v is NonNullable<typeof v> => v !== null);
      } else {
        variables = await ctx.repos.variables.list({ nodeId: input.nodeId });
      }

      // Fetch recent observations for the node
      const observations = await ctx.repos.observations.query({
        nodeId: input.nodeId,
        window: { hours: DEFAULT_TIME_WINDOW_HOURS },
        limit: 1000,
      });

      // Derive estimates for each
      const estimates = variables.map((variable) => ({
        variableId: variable.id,
        estimate: deriveEstimate(variable, observations),
      }));

      return estimates;
    }),

  /**
   * Create a new variable.
   */
  create: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        id: z.string().optional(),
        key: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        kind: z.enum(['continuous', 'ordinal', 'categorical', 'boolean']),
        unit: z.string().optional(),
        viableRange: ViableRangeSchema.optional(),
        preferredRange: ViableRangeSchema.optional(),
        computeSpecs: z.array(ComputeSpecSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_variable',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        nodeId: input.nodeId,
        variable: {
          id: input.id,
          key: input.key,
          title: input.title,
          description: input.description,
          kind: input.kind,
          unit: input.unit,
          viableRange: input.viableRange,
          preferredRange: input.preferredRange,
          computeSpecs: input.computeSpecs,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create variable',
        });
      }

      const data = result.data as { variable: Variable };

      // Publish event
      const event = createEvent('variable.created', input.nodeId, {
        variableId: data.variable.id,
        key: data.variable.key,
      });
      await ctx.eventBus.publish(event);

      return data.variable;
    }),

  /**
   * Update a variable.
   */
  update: protectedProcedure
    .input(
      z.object({
        variableId: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        kind: z.enum(['continuous', 'ordinal', 'categorical', 'boolean']).optional(),
        unit: z.string().optional(),
        viableRange: ViableRangeSchema.optional(),
        preferredRange: ViableRangeSchema.optional(),
        computeSpecs: z.array(ComputeSpecSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current variable to find nodeId for event
      const current = await ctx.repos.variables.get(input.variableId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Variable not found: ${input.variableId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'update_variable',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        variableId: input.variableId,
        updates: {
          title: input.title,
          description: input.description,
          kind: input.kind,
          unit: input.unit,
          viableRange: input.viableRange,
          preferredRange: input.preferredRange,
          computeSpecs: input.computeSpecs,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update variable',
        });
      }

      const data = result.data as { variable: Variable };

      // Publish event
      const event = createEvent('variable.updated', current.nodeId, {
        variableId: data.variable.id,
      });
      await ctx.eventBus.publish(event);

      return data.variable;
    }),

  /**
   * Delete a variable.
   */
  delete: protectedProcedure
    .input(z.object({ variableId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get current variable to find nodeId for event
      const current = await ctx.repos.variables.get(input.variableId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Variable not found: ${input.variableId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'delete_variable',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        variableId: input.variableId,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to delete variable',
        });
      }

      // Publish event
      const event = createEvent('variable.deleted', current.nodeId, {
        variableId: input.variableId,
      });
      await ctx.eventBus.publish(event);

      return { success: true };
    }),
});
