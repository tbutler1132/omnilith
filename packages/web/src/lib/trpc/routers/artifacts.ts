// Artifacts router - CRUD for artifacts and revisions

import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure } from '../middleware';
import { createEvent } from '../../events/bus';

// Zod schemas for artifact content
// Import types from protocol to ensure compatibility
import type { Block, PageDoc, Artifact } from '@omnilith/protocol';

// Block schema with recursive children
// Use z.any() for content since it's typed as `unknown` in the protocol but must be required
const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    content: z.any(),
    children: z.array(BlockSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
) as z.ZodType<Block>;

const PageDocSchema: z.ZodType<PageDoc> = z.object({
  version: z.literal(1),
  blocks: z.array(BlockSchema),
});

export const artifactsRouter = router({
  /**
   * Get an artifact by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const artifact = await ctx.repos.artifacts.get(input.id);
      if (!artifact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Artifact not found: ${input.id}`,
        });
      }
      return artifact;
    }),

  /**
   * List artifacts for a node.
   */
  list: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        status: z.enum(['draft', 'active', 'published', 'archived']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const artifacts = await ctx.repos.artifacts.list({
        nodeId: input.nodeId,
        status: input.status ? [input.status] : undefined,
        limit: input.limit,
        offset: input.offset,
      });
      return artifacts;
    }),

  /**
   * Get all revisions for an artifact.
   */
  getRevisions: publicProcedure
    .input(z.object({ artifactId: z.string() }))
    .query(async ({ ctx, input }) => {
      const revisions = await ctx.repos.artifacts.getRevisions(input.artifactId);
      return revisions;
    }),

  /**
   * Get a specific revision of an artifact.
   */
  getRevision: publicProcedure
    .input(
      z.object({
        artifactId: z.string(),
        version: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const revision = await ctx.repos.artifacts.getRevision(input.artifactId, input.version);
      if (!revision) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Revision ${input.version} not found for artifact ${input.artifactId}`,
        });
      }
      return revision;
    }),

  /**
   * Create a new artifact.
   */
  create: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        id: z.string().optional(),
        title: z.string().min(1),
        about: z.string(),
        notes: z.string().optional(),
        page: PageDocSchema,
        status: z.enum(['draft', 'active', 'published', 'archived']).default('draft'),
        entityRefs: z.array(z.string()).optional(),
        revisionMessage: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_artifact',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        nodeId: input.nodeId,
        artifact: {
          id: input.id,
          title: input.title,
          about: input.about,
          notes: input.notes,
          page: input.page,
          status: input.status,
          entityRefs: input.entityRefs,
        },
        revision: input.revisionMessage ? { message: input.revisionMessage } : undefined,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create artifact',
        });
      }

      const data = result.data as { artifact: Artifact };

      // Publish event
      const event = createEvent('artifact.created', input.nodeId, {
        artifactId: data.artifact.id,
        title: data.artifact.title,
      });
      await ctx.eventBus.publish(event);

      return data.artifact;
    }),

  /**
   * Update an artifact.
   */
  update: protectedProcedure
    .input(
      z.object({
        artifactId: z.string(),
        title: z.string().min(1).optional(),
        about: z.string().optional(),
        notes: z.string().optional(),
        page: PageDocSchema.optional(),
        entityRefs: z.array(z.string()).optional(),
        revisionMessage: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current artifact to find nodeId for event
      const current = await ctx.repos.artifacts.get(input.artifactId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Artifact not found: ${input.artifactId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'update_artifact',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        artifactId: input.artifactId,
        updates: {
          title: input.title,
          about: input.about,
          notes: input.notes,
          page: input.page,
          entityRefs: input.entityRefs,
        },
        revision: input.revisionMessage ? { message: input.revisionMessage } : undefined,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update artifact',
        });
      }

      const data = result.data as { artifact: Artifact };

      // Publish event
      const event = createEvent('artifact.updated', current.nodeId, {
        artifactId: data.artifact.id,
        version: data.artifact.trunkVersion,
      });
      await ctx.eventBus.publish(event);

      return data.artifact;
    }),

  /**
   * Update artifact status.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        artifactId: z.string(),
        status: z.enum(['draft', 'active', 'published', 'archived']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current artifact to find nodeId for event
      const current = await ctx.repos.artifacts.get(input.artifactId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Artifact not found: ${input.artifactId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'update_artifact_status',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        artifactId: input.artifactId,
        status: input.status,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update artifact status',
        });
      }

      // Publish event
      const event = createEvent('artifact.statusChanged', current.nodeId, {
        artifactId: input.artifactId,
        status: input.status,
      });
      await ctx.eventBus.publish(event);

      return { success: true, status: input.status };
    }),

  /**
   * Delete an artifact.
   */
  delete: protectedProcedure
    .input(z.object({ artifactId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get current artifact to find nodeId for event
      const current = await ctx.repos.artifacts.get(input.artifactId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Artifact not found: ${input.artifactId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'delete_artifact',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        artifactId: input.artifactId,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to delete artifact',
        });
      }

      // Publish event
      const event = createEvent('artifact.deleted', current.nodeId, {
        artifactId: input.artifactId,
      });
      await ctx.eventBus.publish(event);

      return { success: true };
    }),
});
