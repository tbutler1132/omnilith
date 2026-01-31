import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Nodes table - cybernetic boundaries that scope observations, policies, and authority.
 */
export const nodes = pgTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['subject', 'object', 'agent'] }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('nodes_kind_idx').on(table.kind)]
);

/**
 * Node edges table - relationships between nodes.
 */
export const nodeEdges = pgTable(
  'node_edges',
  {
    id: text('id').primaryKey(),
    fromNodeId: text('from_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    toNodeId: text('to_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: ['follows', 'member_of', 'maintains', 'feeds', 'shares_with'],
    }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('node_edges_from_idx').on(table.fromNodeId),
    index('node_edges_to_idx').on(table.toNodeId),
    index('node_edges_type_idx').on(table.type),
  ]
);

/**
 * Agent delegations - authority granted from sponsor to agent nodes.
 */
export const agentDelegations = pgTable(
  'agent_delegations',
  {
    agentNodeId: text('agent_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    sponsorNodeId: text('sponsor_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    constraints: jsonb('constraints').$type<{
      maxRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
      allowedEffects?: string[];
      expiresAt?: string;
    }>(),
  },
  (table) => [
    index('agent_delegations_agent_idx').on(table.agentNodeId),
    index('agent_delegations_sponsor_idx').on(table.sponsorNodeId),
  ]
);
