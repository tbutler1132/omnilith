// Observations router - ingestion and query

import { z } from 'zod';
import type { IngestObservationInput } from '@omnilith/runtime';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure } from '../middleware';
import { createEvent } from '../../events/bus';
import { processObservation } from '@omnilith/runtime';

// Zod schema for provenance
const ProvenanceSchema = z.object({
  sourceId: z.string(),
  method: z.enum([
    'manual',
    'sensor',
    'derived',
    'api_import',
    'agent_inference',
    'system',
  ]),
  confidence: z.number().min(0).max(1).optional(),
  parentObservationId: z.string().optional(),
});

// Zod schema for observation input (matches IngestObservationInput from runtime)
const ObservationInputSchema: z.ZodType<IngestObservationInput> = z.object({
  nodeId: z.string(),
  type: z.string(),
  payload: z.any(),
  provenance: ProvenanceSchema,
  timestamp: z.string().optional(),
  tags: z.array(z.string()).optional(),
}) as z.ZodType<IngestObservationInput>;

// Observation query limits per spec section 0.6
const MAX_OBSERVATIONS = 1000;
const DEFAULT_LIMIT = 100;
const DEFAULT_TIME_WINDOW_HOURS = 24;

export const observationsRouter = router({
  /**
   * Get an observation by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const observation = await ctx.repos.observations.get(input.id);
      if (!observation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Observation not found: ${input.id}`,
        });
      }
      return observation;
    }),

  /**
   * Query observations with filtering.
   * Enforces limits from spec section 0.6.
   */
  query: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        type: z.string().optional(),
        typePrefix: z.string().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().min(1).max(MAX_OBSERVATIONS).default(DEFAULT_LIMIT),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build time range filter
      const timeRange =
        input.since || input.until
          ? {
              start: input.since,
              end: input.until,
            }
          : undefined;

      // Apply default window if no time range specified
      const window = !timeRange ? { hours: DEFAULT_TIME_WINDOW_HOURS } : undefined;

      const observations = await ctx.repos.observations.query({
        nodeId: input.nodeId,
        type: input.type,
        typePrefix: input.typePrefix,
        window,
        timeRange,
        tags: input.tags,
        limit: input.limit,
        offset: input.offset,
      });

      return observations;
    }),

  /**
   * Get recent observations for a node.
   */
  recent: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const observations = await ctx.repos.observations.query({
        nodeId: input.nodeId,
        window: { hours: DEFAULT_TIME_WINDOW_HOURS },
        limit: input.limit,
      });

      return observations;
    }),

  /**
   * Ingest a new observation and process it through policies.
   * This is the primary entry point for observation data.
   */
  ingest: protectedProcedure
    .input(ObservationInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Process the observation through the runtime
      // This will:
      // 1. Persist the observation
      // 2. Evaluate matching policies
      // 3. Execute any resulting effects
      const result = await processObservation(ctx.repos, input);

      // Publish event
      const event = createEvent('observation.created', input.nodeId, {
        observationId: result.observation.id,
        observationType: result.observation.type,
      });
      await ctx.eventBus.publish(event);

      return {
        observationId: result.observation.id,
        policiesEvaluated: result.evaluation.policiesEvaluated,
        effectsExecuted: result.execution.totalExecuted,
      };
    }),

  /**
   * Batch ingest multiple observations.
   */
  ingestBatch: protectedProcedure
    .input(
      z.object({
        observations: z.array(ObservationInputSchema).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results = [];

      for (const obsInput of input.observations) {
        try {
          const result = await processObservation(ctx.repos, obsInput);

          results.push({
            observationId: result.observation.id,
            success: true,
            policiesEvaluated: result.evaluation.policiesEvaluated,
            effectsExecuted: result.execution.totalExecuted,
          });

          // Publish event
          const event = createEvent('observation.created', obsInput.nodeId, {
            observationId: result.observation.id,
            observationType: result.observation.type,
          });
          await ctx.eventBus.publish(event);
        } catch (error) {
          results.push({
            observationId: 'unknown',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        total: input.observations.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    }),
});
