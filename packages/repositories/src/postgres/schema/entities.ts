import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';

/**
 * Entity types table - schema definitions for entity kinds.
 */
export const entityTypes = pgTable(
  'entity_types',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    typeName: text('type_name').notNull(), // e.g., "song", "project"
    title: text('title').notNull(),
    description: text('description'),
    schema: jsonb('schema').$type<Record<string, unknown>>().notNull(), // JSON schema
    eventTypes: jsonb('event_types').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('entity_types_node_idx').on(table.nodeId),
    index('entity_types_name_idx').on(table.typeName),
    index('entity_types_node_name_idx').on(table.nodeId, table.typeName),
  ]
);

/**
 * Entities table - durable referents with stable identity.
 *
 * Entity state is derived from events. The state column is a materialized
 * view that can be rebuilt by replaying events.
 */
export const entities = pgTable(
  'entities',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    typeId: text('type_id')
      .notNull()
      .references(() => entityTypes.id),
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('entities_node_idx').on(table.nodeId),
    index('entities_type_idx').on(table.typeId),
    index('entities_node_type_idx').on(table.nodeId, table.typeId),
  ]
);

/**
 * Entity events table - append-only event log for entity state changes.
 *
 * This is the source of truth for entity state. The entities.state column
 * is derived by replaying these events.
 */
export const entityEvents = pgTable(
  'entity_events',
  {
    id: text('id').primaryKey(),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // e.g., "created", "title_changed"
    data: jsonb('data').$type<unknown>().notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    actorNodeId: text('actor_node_id')
      .notNull()
      .references(() => nodes.id),
  },
  (table) => [
    index('entity_events_entity_idx').on(table.entityId),
    index('entity_events_type_idx').on(table.type),
    index('entity_events_timestamp_idx').on(table.timestamp),
    index('entity_events_entity_timestamp_idx').on(table.entityId, table.timestamp),
  ]
);
