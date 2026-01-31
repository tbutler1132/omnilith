import { pgTable, text, timestamp, jsonb, real, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';
import type { ViableRange, ProxySpec } from '@omnilith/protocol';

/**
 * Variables table - regulated quantities with viable ranges.
 */
export const variables = pgTable(
  'variables',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    key: text('key').notNull(), // e.g., "sleep_quality"
    title: text('title').notNull(),
    description: text('description'),
    kind: text('kind', {
      enum: ['continuous', 'ordinal', 'categorical', 'boolean'],
    }).notNull(),
    unit: text('unit'), // e.g., "hours", "%", "score"
    viableRange: jsonb('viable_range').$type<ViableRange>(),
    preferredRange: jsonb('preferred_range').$type<ViableRange>(),
    proxies: jsonb('proxies').$type<ProxySpec[]>().notNull().default([]),
    prior: jsonb('prior').$type<unknown>(),
    target: jsonb('target').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('variables_node_idx').on(table.nodeId),
    index('variables_key_idx').on(table.key),
    index('variables_node_key_idx').on(table.nodeId, table.key),
  ]
);

/**
 * Variable estimate cache - derived state, NOT canon.
 *
 * This table is a performance optimization. It can be dropped and rebuilt
 * from observations at any time. The system remains correct without it.
 */
export const variableEstimateCache = pgTable(
  'variable_estimate_cache',
  {
    variableId: text('variable_id')
      .primaryKey()
      .references(() => variables.id, { onDelete: 'cascade' }),
    value: jsonb('value').$type<number | string | boolean>().notNull(),
    confidence: real('confidence').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
    inViableRange: jsonb('in_viable_range').$type<boolean>().notNull(),
    inPreferredRange: jsonb('in_preferred_range').$type<boolean>().notNull(),
    trend: text('trend', { enum: ['improving', 'stable', 'degrading'] }),
    deviation: real('deviation').notNull(),
  }
);
