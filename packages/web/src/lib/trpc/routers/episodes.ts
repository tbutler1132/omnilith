// Episodes router - CRUD for episodes

import { z } from 'zod';
import type { Episode } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure } from '../middleware';
import { createEvent } from '../../events/bus';

// EpisodeIntent is a string enum in the protocol
const EpisodeIntentSchema = z.enum([
  'stabilize',
  'increase',
  'decrease',
  'maintain',
  'probe',
  'expand',
  'discover',
]);

const EpisodeVariableSchema = z.object({
  variableId: z.string(),
  intent: EpisodeIntentSchema,
});

export const episodesRouter = router({
  /**
   * Get an episode by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const episode = await ctx.repos.episodes.get(input.id);
      if (!episode) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Episode not found: ${input.id}`,
        });
      }
      return episode;
    }),

  /**
   * List episodes for a node.
   */
  list: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        status: z.enum(['planned', 'active', 'completed', 'abandoned']).optional(),
        kind: z.enum(['regulatory', 'exploratory']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const episodes = await ctx.repos.episodes.list({
        nodeId: input.nodeId,
        status: input.status ? [input.status] : undefined,
        kind: input.kind,
        limit: input.limit,
        offset: input.offset,
      });
      return episodes;
    }),

  /**
   * Get active episodes for a node.
   */
  getActive: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const episodes = await ctx.repos.episodes.list({
        nodeId: input.nodeId,
        status: ['active'],
      });
      return episodes;
    }),

  /**
   * Create a new episode.
   */
  create: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        id: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        kind: z.enum(['regulatory', 'exploratory']),
        variables: z.array(EpisodeVariableSchema),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        relatedArtifactIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_episode',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        nodeId: input.nodeId,
        episode: {
          id: input.id,
          title: input.title,
          description: input.description,
          kind: input.kind,
          variables: input.variables,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          relatedArtifactIds: input.relatedArtifactIds,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create episode',
        });
      }

      const data = result.data as { episode: Episode };

      // Publish event
      const event = createEvent('episode.created', input.nodeId, {
        episodeId: data.episode.id,
        title: data.episode.title,
        kind: data.episode.kind,
      });
      await ctx.eventBus.publish(event);

      return data.episode;
    }),

  /**
   * Update an episode.
   */
  update: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        variables: z.array(EpisodeVariableSchema).optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        relatedArtifactIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current episode to find nodeId for event
      const current = await ctx.repos.episodes.get(input.episodeId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Episode not found: ${input.episodeId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'update_episode',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        episodeId: input.episodeId,
        updates: {
          title: input.title,
          description: input.description,
          variables: input.variables,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          relatedArtifactIds: input.relatedArtifactIds,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update episode',
        });
      }

      const data = result.data as { episode: Episode };

      // Publish event
      const event = createEvent('episode.updated', current.nodeId, {
        episodeId: data.episode.id,
      });
      await ctx.eventBus.publish(event);

      return data.episode;
    }),

  /**
   * Update episode status.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        episodeId: z.string(),
        status: z.enum(['planned', 'active', 'completed', 'abandoned']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current episode to find nodeId for event
      const current = await ctx.repos.episodes.get(input.episodeId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Episode not found: ${input.episodeId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'update_episode_status',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        episodeId: input.episodeId,
        status: input.status,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update episode status',
        });
      }

      // Publish event
      const event = createEvent('episode.statusChanged', current.nodeId, {
        episodeId: input.episodeId,
        status: input.status,
      });
      await ctx.eventBus.publish(event);

      return { success: true, status: input.status };
    }),
});
