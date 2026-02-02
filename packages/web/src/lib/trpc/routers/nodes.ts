// Nodes router - CRUD for nodes and edges

import { z } from 'zod';
import type { Node } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure, subjectProcedure } from '../middleware';

export const nodesRouter = router({
  /**
   * Get a node by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const node = await ctx.repos.nodes.get(input.id);
      if (!node) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Node not found: ${input.id}`,
        });
      }
      return node;
    }),

  /**
   * List all nodes.
   * In production, this would be scoped by access control.
   */
  list: publicProcedure
    .input(
      z
        .object({
          kind: z.enum(['subject', 'object', 'agent']).optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx: _ctx, input: _input }) => {
      // The node repository doesn't have a list method with filters,
      // so we'd need to add that or use a query method
      // For now, return an error indicating this needs implementation
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'Node listing not yet implemented in repository',
      });
    }),

  /**
   * Get edges for a node.
   */
  getEdges: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        direction: z.enum(['from', 'to', 'both']).default('both'),
        edgeType: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const edges = await ctx.repos.nodes.getEdges(input.nodeId);

      // Filter by direction if specified
      let filtered = edges;
      if (input.direction === 'from') {
        filtered = edges.filter((e) => e.fromNodeId === input.nodeId);
      } else if (input.direction === 'to') {
        filtered = edges.filter((e) => e.toNodeId === input.nodeId);
      }

      // Filter by type if specified
      if (input.edgeType) {
        filtered = filtered.filter((e) => e.type === input.edgeType);
      }

      return filtered;
    }),

  /**
   * Create a new node.
   */
  create: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        kind: z.enum(['subject', 'object', 'agent']),
        name: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'create_node',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        node: {
          id: input.id,
          kind: input.kind,
          name: input.name,
          metadata: input.metadata,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to create node',
        });
      }

      const data = result.data as { node: Node };
      return data.node;
    }),

  /**
   * Update a node.
   */
  update: protectedProcedure
    .input(
      z.object({
        nodeId: z.string(),
        name: z.string().min(1).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'update_node',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        nodeId: input.nodeId,
        updates: {
          name: input.name,
          metadata: input.metadata,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to update node',
        });
      }

      const data = result.data as { node: Node };
      return data.node;
    }),

  /**
   * Add an edge between nodes.
   */
  addEdge: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.string(),
        toNodeId: z.string(),
        edgeType: z.enum(['follows', 'member_of', 'maintains', 'feeds', 'shares_with']),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'add_edge',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        edgeType: input.edgeType,
        metadata: input.metadata,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to add edge',
        });
      }

      return { success: true };
    }),

  /**
   * Remove an edge between nodes.
   */
  removeEdge: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.string(),
        toNodeId: z.string(),
        edgeType: z.enum(['follows', 'member_of', 'maintains', 'feeds', 'shares_with']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'remove_edge',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        edgeType: input.edgeType,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to remove edge',
        });
      }

      return { success: true };
    }),

  /**
   * Set agent delegation (subject only).
   */
  setAgentDelegation: subjectProcedure
    .input(
      z.object({
        agentNodeId: z.string(),
        sponsorNodeId: z.string(),
        scopes: z.array(z.string()),
        constraints: z
          .object({
            maxRiskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
            allowedActionTypes: z.array(z.string()).optional(),
            rateLimit: z
              .object({
                maxPerHour: z.number().optional(),
                maxPerDay: z.number().optional(),
              })
              .optional(),
          })
          .optional(),
        expiresAt: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prism.execute({
        type: 'set_agent_delegation',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        agentNodeId: input.agentNodeId,
        delegation: {
          sponsorNodeId: input.sponsorNodeId,
          scopes: input.scopes,
          constraints: input.constraints,
          expiresAt: input.expiresAt,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to set agent delegation',
        });
      }

      return { success: true };
    }),
});
