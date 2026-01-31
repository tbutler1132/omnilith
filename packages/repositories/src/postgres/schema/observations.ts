import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';

/**
 * Observations table - immutable append-only event log.
 *
 * Design notes:
 * - Append-only: no updates or deletes in normal operation
 * - Consider time-based partitioning for large deployments
 * - Payload is JSONB for flexible observation types
 */
export const observations = pgTable(
  'observations',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // e.g., "health.sleep", "work.task.completed"
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    provenance: jsonb('provenance')
      .$type<{
        sourceId: string;
        sponsorId?: string;
        method?: string;
        confidence?: number;
      }>()
      .notNull(),
    tags: jsonb('tags').$type<string[]>(),
  },
  (table) => [
    index('observations_node_idx').on(table.nodeId),
    index('observations_type_idx').on(table.type),
    index('observations_timestamp_idx').on(table.timestamp),
    index('observations_node_type_idx').on(table.nodeId, table.type),
    index('observations_node_timestamp_idx').on(table.nodeId, table.timestamp),
  ]
);
