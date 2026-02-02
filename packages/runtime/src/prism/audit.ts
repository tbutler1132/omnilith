// Prism Audit Store
//
// Stores audit entries for all Prism operations.
// In production, this would be backed by a database.
// For testing and development, an in-memory store is provided.

import type { AuditEntry, Id } from '@omnilith/protocol';

/**
 * Interface for storing and querying audit entries.
 */
export interface AuditStore {
  /**
   * Append an audit entry.
   */
  append(entry: AuditEntry): Promise<void>;

  /**
   * Get an audit entry by ID.
   */
  get(id: Id): Promise<AuditEntry | null>;

  /**
   * Query audit entries by node ID.
   */
  getByNode(nodeId: Id, options?: AuditQueryOptions): Promise<AuditEntry[]>;

  /**
   * Query audit entries by resource.
   */
  getByResource(
    resourceType: string,
    resourceId: Id,
    options?: AuditQueryOptions
  ): Promise<AuditEntry[]>;

  /**
   * Query all audit entries with optional filters.
   */
  query(filter?: AuditQueryFilter): Promise<AuditEntry[]>;
}

/**
 * Options for querying audit entries.
 */
export type AuditQueryOptions = {
  /** Maximum entries to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Start time filter */
  since?: string;

  /** End time filter */
  until?: string;
};

/**
 * Filter for audit queries.
 */
export type AuditQueryFilter = AuditQueryOptions & {
  /** Filter by node ID */
  nodeId?: Id;

  /** Filter by resource type */
  resourceType?: string;

  /** Filter by resource ID */
  resourceId?: Id;

  /** Filter by operation type */
  operationType?: string;

  /** Filter by success status */
  success?: boolean;
};

/**
 * Create an in-memory audit store for testing and development.
 *
 * This store keeps all entries in memory and is not persisted.
 * For production use, implement AuditStore backed by a database.
 */
export function createInMemoryAuditStore(): AuditStore {
  const entries: AuditEntry[] = [];

  return {
    async append(entry: AuditEntry): Promise<void> {
      entries.push(entry);
    },

    async get(id: Id): Promise<AuditEntry | null> {
      return entries.find((e) => e.id === id) ?? null;
    },

    async getByNode(nodeId: Id, options?: AuditQueryOptions): Promise<AuditEntry[]> {
      return filterAndPaginate(
        entries.filter((e) => e.nodeId === nodeId),
        options
      );
    },

    async getByResource(
      resourceType: string,
      resourceId: Id,
      options?: AuditQueryOptions
    ): Promise<AuditEntry[]> {
      return filterAndPaginate(
        entries.filter(
          (e) => e.resourceType === resourceType && e.resourceId === resourceId
        ),
        options
      );
    },

    async query(filter?: AuditQueryFilter): Promise<AuditEntry[]> {
      let result = [...entries];

      if (filter?.nodeId) {
        result = result.filter((e) => e.nodeId === filter.nodeId);
      }

      if (filter?.resourceType) {
        result = result.filter((e) => e.resourceType === filter.resourceType);
      }

      if (filter?.resourceId) {
        result = result.filter((e) => e.resourceId === filter.resourceId);
      }

      if (filter?.operationType) {
        result = result.filter((e) => e.operationType === filter.operationType);
      }

      if (filter?.success !== undefined) {
        result = result.filter((e) => e.success === filter.success);
      }

      return filterAndPaginate(result, filter);
    },
  };
}

/**
 * Apply time filtering and pagination to a list of audit entries.
 */
function filterAndPaginate(
  entries: AuditEntry[],
  options?: AuditQueryOptions
): AuditEntry[] {
  let result = entries;

  // Apply time filters
  if (options?.since) {
    const since = new Date(options.since);
    result = result.filter((e) => new Date(e.timestamp) >= since);
  }

  if (options?.until) {
    const until = new Date(options.until);
    result = result.filter((e) => new Date(e.timestamp) <= until);
  }

  // Sort by timestamp descending (most recent first)
  result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply pagination
  if (options?.offset) {
    result = result.slice(options.offset);
  }

  if (options?.limit) {
    result = result.slice(0, options.limit);
  }

  return result;
}
