import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';
import type { EpisodeVariable } from '@omnilith/protocol';

/**
 * Episodes table - time-bounded structured interventions.
 */
export const episodes = pgTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    kind: text('kind', { enum: ['regulatory', 'exploratory'] }).notNull(),
    variables: jsonb('variables').$type<EpisodeVariable[]>().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    relatedArtifactIds: jsonb('related_artifact_ids').$type<string[]>(),
    status: text('status', {
      enum: ['planned', 'active', 'completed', 'abandoned'],
    })
      .notNull()
      .default('planned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('episodes_node_idx').on(table.nodeId),
    index('episodes_status_idx').on(table.status),
    index('episodes_node_status_idx').on(table.nodeId, table.status),
    index('episodes_kind_idx').on(table.kind),
  ]
);
