import { pgTable, text, timestamp, jsonb, integer, boolean, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';

/**
 * Policies table - pure functions that evaluate observations and return effects.
 *
 * Policies are stored as code text. The runtime evaluates them in a sandboxed
 * environment. Policies MUST be pure - no side effects, no storage access.
 */
export const policies = pgTable(
  'policies',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    priority: integer('priority').notNull().default(100), // Lower = higher priority
    enabled: boolean('enabled').notNull().default(true),
    triggers: jsonb('triggers').$type<string[]>().notNull(), // Observation types (wildcards)
    implementation: jsonb('implementation')
      .$type<{
        kind: 'typescript';
        code: string;
      }>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('policies_node_idx').on(table.nodeId),
    index('policies_enabled_idx').on(table.enabled),
    index('policies_priority_idx').on(table.priority),
    index('policies_node_enabled_idx').on(table.nodeId, table.enabled),
  ]
);
