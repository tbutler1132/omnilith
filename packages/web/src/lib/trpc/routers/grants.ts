// Grants router - CRUD for access grants

import { z } from 'zod';
import type { Grant } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { subjectProcedure } from '../middleware';
import { createEvent } from '../../events/bus';

// ResourceType enum from protocol
const ResourceTypeSchema = z.enum(['node', 'artifact', 'surface', 'entity', 'variable', 'episode']);

// Zod schema for grant scope
const GrantScopeSchema = z.enum(['read', 'write', 'admin', 'execute']);

export const grantsRouter = router({
  /**
   * List grants for a resource.
   */
  list: publicProcedure
    .input(
      z.object({
        resourceType: ResourceTypeSchema,
        resourceId: z.string(),
        granteeNodeId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const grants = await ctx.repos.grants.getForResource(
        input.resourceType,
        input.resourceId
      );
      // Filter by grantee if specified
      if (input.granteeNodeId) {
        return grants.filter((g) => g.granteeNodeId === input.granteeNodeId);
      }
      return grants;
    }),

  /**
   * List grants for a grantee node.
   */
  listForGrantee: publicProcedure
    .input(
      z.object({
        granteeNodeId: z.string(),
        resourceType: ResourceTypeSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const grants = await ctx.repos.grants.getForGrantee(input.granteeNodeId);
      // Filter by resource type if specified
      if (input.resourceType) {
        return grants.filter((g) => g.resourceType === input.resourceType);
      }
      return grants;
    }),

  /**
   * Check if a node has specific access to a resource.
   */
  check: publicProcedure
    .input(
      z.object({
        granteeNodeId: z.string(),
        resourceType: ResourceTypeSchema,
        resourceId: z.string(),
        scope: GrantScopeSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const hasAccess = await ctx.repos.grants.hasAccess(
        input.granteeNodeId,
        input.resourceType,
        input.resourceId,
        input.scope
      );
      return { hasAccess };
    }),

  /**
   * Create a new grant.
   * Only subject nodes can create grants.
   */
  create: subjectProcedure
    .input(
      z.object({
        id: z.string().optional(),
        granteeNodeId: z.string(),
        resourceType: ResourceTypeSchema,
        resourceId: z.string(),
        scopes: z.array(GrantScopeSchema).min(1),
        expiresAt: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_grant',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        grant: {
          id: input.id,
          granteeNodeId: input.granteeNodeId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          scopes: input.scopes,
          expiresAt: input.expiresAt,
          metadata: input.metadata,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create grant',
        });
      }

      const data = result.data as { grant: Grant };

      // Publish event
      const event = createEvent('grant.created', ctx.auth.nodeId, {
        grantId: data.grant.id,
        granteeNodeId: input.granteeNodeId,
      });
      await ctx.eventBus.publish(event);

      return data.grant;
    }),

  /**
   * Revoke a grant.
   * Only subject nodes can revoke grants.
   */
  revoke: subjectProcedure
    .input(
      z.object({
        grantId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'revoke_grant',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        grantId: input.grantId,
        reason: input.reason,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to revoke grant',
        });
      }

      // Publish event
      const event = createEvent('grant.revoked', ctx.auth.nodeId, {
        grantId: input.grantId,
        reason: input.reason,
      });
      await ctx.eventBus.publish(event);

      return { success: true };
    }),
});
