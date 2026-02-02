// Actions router - ActionRun approval and execution

import { z } from 'zod';
import type { ActionRun } from '@omnilith/protocol';
import { router, publicProcedure, TRPCError } from '../index';
import { protectedProcedure, subjectProcedure } from '../middleware';
import { createEvent } from '../../events/bus';

export const actionsRouter = router({
  /**
   * Get an action run by ID.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const actionRun = await ctx.repos.actionRuns.get(input.id);
      if (!actionRun) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `ActionRun not found: ${input.id}`,
        });
      }
      return actionRun;
    }),

  /**
   * List action runs for a node.
   */
  list: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        status: z
          .enum(['pending', 'approved', 'rejected', 'executed', 'failed'])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const actionRuns = await ctx.repos.actionRuns.query({
        nodeId: input.nodeId,
        status: input.status ? [input.status] : undefined,
        limit: input.limit,
        offset: input.offset,
      });
      return actionRuns;
    }),

  /**
   * Get pending action runs requiring approval.
   */
  getPending: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const actionRuns = await ctx.repos.actionRuns.getPendingApproval(input.nodeId);

      // Filter by risk level if specified
      if (input.riskLevel) {
        return actionRuns.filter((ar) => ar.riskLevel === input.riskLevel);
      }

      return actionRuns;
    }),

  /**
   * Approve an action run.
   * Subject nodes can approve any risk level.
   * Agents can only approve up to their delegated max risk level.
   */
  approve: protectedProcedure
    .input(
      z.object({
        actionRunId: z.string(),
        method: z.enum(['manual', 'auto']).default('manual'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the action run to find nodeId and check risk
      const actionRun = await ctx.repos.actionRuns.get(input.actionRunId);
      if (!actionRun) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `ActionRun not found: ${input.actionRunId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'approve_action_run',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        actionRunId: input.actionRunId,
        method: input.method,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to approve action run',
        });
      }

      // Publish event
      const event = createEvent('actionRun.statusChanged', actionRun.nodeId, {
        actionRunId: input.actionRunId,
        status: 'approved',
        previousStatus: 'pending',
      });
      await ctx.eventBus.publish(event);

      const data = result.data as { actionRun: ActionRun };
      return data.actionRun;
    }),

  /**
   * Reject an action run.
   */
  reject: protectedProcedure
    .input(
      z.object({
        actionRunId: z.string(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the action run to find nodeId
      const actionRun = await ctx.repos.actionRuns.get(input.actionRunId);
      if (!actionRun) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `ActionRun not found: ${input.actionRunId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'reject_action_run',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        actionRunId: input.actionRunId,
        reason: input.reason,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to reject action run',
        });
      }

      // Publish event
      const event = createEvent('actionRun.statusChanged', actionRun.nodeId, {
        actionRunId: input.actionRunId,
        status: 'rejected',
        previousStatus: 'pending',
      });
      await ctx.eventBus.publish(event);

      const data = result.data as { actionRun: ActionRun };
      return data.actionRun;
    }),

  /**
   * Execute an approved action run.
   * Only subject nodes can execute actions.
   */
  execute: subjectProcedure
    .input(
      z.object({
        actionRunId: z.string(),
        timeoutMs: z.number().min(1000).max(300000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the action run to find nodeId
      const actionRun = await ctx.repos.actionRuns.get(input.actionRunId);
      if (!actionRun) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `ActionRun not found: ${input.actionRunId}`,
        });
      }

      const result = await ctx.prism.execute({
        type: 'execute_action_run',
        actor: { nodeId: ctx.auth.nodeId, method: 'api' },
        actionRunId: input.actionRunId,
        timeoutMs: input.timeoutMs,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error ?? 'Failed to execute action run',
        });
      }

      const data = result.data as { actionRun: ActionRun; result?: unknown; durationMs: number };

      // Publish event
      const event = createEvent('actionRun.statusChanged', actionRun.nodeId, {
        actionRunId: input.actionRunId,
        status: data.actionRun.status,
        previousStatus: 'approved',
      });
      await ctx.eventBus.publish(event);

      return {
        actionRun: data.actionRun,
        result: data.result,
        durationMs: data.durationMs,
      };
    }),
});
