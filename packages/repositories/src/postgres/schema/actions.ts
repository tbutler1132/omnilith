import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';
import { policies } from './policies.js';
import { observations } from './observations.js';
import type { ActionProposal, RiskLevel } from '@omnilith/protocol';

/**
 * Action runs table - auditable execution records.
 *
 * Actions flow through a lifecycle:
 * pending → approved/rejected → executed/failed
 */
export const actionRuns = pgTable(
  'action_runs',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    proposedByPolicyId: text('proposed_by_policy_id')
      .notNull()
      .references(() => policies.id),
    proposedByObservationId: text('proposed_by_observation_id')
      .notNull()
      .references(() => observations.id),
    action: jsonb('action').$type<ActionProposal>().notNull(),
    riskLevel: text('risk_level', {
      enum: ['low', 'medium', 'high', 'critical'],
    })
      .notNull()
      .$type<RiskLevel>(),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'executed', 'failed'],
    })
      .notNull()
      .default('pending'),
    approval: jsonb('approval').$type<{
      approvedBy: string;
      approvedAt: string;
      method: 'manual' | 'auto';
    }>(),
    rejection: jsonb('rejection').$type<{
      rejectedBy: string;
      rejectedAt: string;
      reason: string;
    }>(),
    execution: jsonb('execution').$type<{
      startedAt: string;
      completedAt: string;
      result: unknown;
      error?: string;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('action_runs_node_idx').on(table.nodeId),
    index('action_runs_status_idx').on(table.status),
    index('action_runs_risk_level_idx').on(table.riskLevel),
    index('action_runs_node_status_idx').on(table.nodeId, table.status),
  ]
);
