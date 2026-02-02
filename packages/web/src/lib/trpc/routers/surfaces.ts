// Surfaces router - CRUD for surfaces

import { z } from 'zod';
import type { Surface } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure } from '../middleware';
import { createEvent } from '../../events/bus';

// Surface kinds from protocol
const SurfaceKindSchema = z.enum(['page', 'gallery', 'timeline', 'workshop', 'custom']);
const SurfaceVisibilitySchema = z.enum(['public', 'node_members', 'granted', 'private']);

// Zod schemas for surface layouts (QuerySpec from protocol)
const QuerySpecSchema = z.object({
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.array(z.string()).optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  orderBy: z
    .object({
      field: z.string(),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
});

// LayoutSpec from protocol - use z.any() for complex nested structure
// since full validation would be very deep and types are enforced by protocol
const LayoutSpecSchema = z.any();

export const surfacesRouter = router({
  /**
   * Get a surface by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const surface = await ctx.repos.surfaces.get(input.id);
      if (!surface) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Surface not found: ${input.id}`,
        });
      }
      return surface;
    }),

  /**
   * List surfaces for a node.
   */
  list: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        kind: SurfaceKindSchema.optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const surfaces = await ctx.repos.surfaces.list({
        nodeId: input.nodeId,
        kind: input.kind,
        limit: input.limit,
        offset: input.offset,
      });
      return surfaces;
    }),

  /**
   * Get surfaces visible to the authenticated user.
   * Respects visibility settings (private, node, public).
   */
  getVisible: protectedProcedure
    .input(
      z.object({
        nodeId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      // For now, return all surfaces for the node
      // Production would filter by visibility based on auth context
      const nodeId = input.nodeId ?? ctx.auth.nodeId;
      const surfaces = await ctx.repos.surfaces.list({
        nodeId,
        limit: input.limit,
      });

      // Filter by visibility
      return surfaces.filter((s) => {
        if (s.visibility === 'public') return true;
        if (s.visibility === 'node_members' && s.nodeId === ctx.auth.nodeId) return true;
        if (s.visibility === 'private' && s.nodeId === ctx.auth.nodeId) return true;
        // TODO: 'granted' visibility requires checking grants
        return false;
      });
    }),

  /**
   * Create a new surface.
   */
  create: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        id: z.string().optional(),
        kind: SurfaceKindSchema,
        title: z.string().min(1),
        visibility: SurfaceVisibilitySchema.default('private'),
        entry: z
          .object({
            artifactId: z.string().optional(),
            query: QuerySpecSchema.optional(),
          })
          .optional(),
        layoutId: z.string().optional(),
        inlineLayout: LayoutSpecSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_surface',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        nodeId: input.nodeId,
        surface: {
          id: input.id,
          kind: input.kind,
          title: input.title,
          visibility: input.visibility,
          entry: input.entry,
          layoutId: input.layoutId,
          inlineLayout: input.inlineLayout,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create surface',
        });
      }

      const data = result.data as { surface: Surface };

      // Publish event
      const event = createEvent('surface.created', input.nodeId, {
        surfaceId: data.surface.id,
        kind: data.surface.kind,
      });
      await ctx.eventBus.publish(event);

      return data.surface;
    }),

  /**
   * Update a surface.
   */
  update: protectedProcedure
    .input(
      z.object({
        surfaceId: z.string(),
        title: z.string().min(1).optional(),
        visibility: SurfaceVisibilitySchema.optional(),
        entry: z
          .object({
            artifactId: z.string().optional(),
            query: QuerySpecSchema.optional(),
          })
          .optional(),
        layoutId: z.string().optional(),
        inlineLayout: LayoutSpecSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current surface to find nodeId for event
      const current = await ctx.repos.surfaces.get(input.surfaceId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Surface not found: ${input.surfaceId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'update_surface',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        surfaceId: input.surfaceId,
        updates: {
          title: input.title,
          visibility: input.visibility,
          entry: input.entry,
          layoutId: input.layoutId,
          inlineLayout: input.inlineLayout,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update surface',
        });
      }

      const data = result.data as { surface: Surface };

      // Publish event
      const event = createEvent('surface.updated', current.nodeId, {
        surfaceId: data.surface.id,
      });
      await ctx.eventBus.publish(event);

      return data.surface;
    }),

  /**
   * Delete a surface.
   */
  delete: protectedProcedure
    .input(z.object({ surfaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get current surface to find nodeId for event
      const current = await ctx.repos.surfaces.get(input.surfaceId);
      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Surface not found: ${input.surfaceId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'delete_surface',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        surfaceId: input.surfaceId,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to delete surface',
        });
      }

      // Publish event
      const event = createEvent('surface.deleted', current.nodeId, {
        surfaceId: input.surfaceId,
      });
      await ctx.eventBus.publish(event);

      return { success: true };
    }),
});
