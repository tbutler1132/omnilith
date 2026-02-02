// tRPC request context
//
// Creates the context available to all tRPC procedures.
// Includes repositories, Prism, authentication, and event bus.

import type { TransactionalRepositoryContext } from '@omnilith/repositories';
import type { Prism } from '@omnilith/runtime';
import { createPrism, createInMemoryAuditStore } from '@omnilith/runtime';
import type { AuthContext } from '../auth/types';
import { getAuthFromRequest } from '../auth/dev-auth';
import { getRepositoryContext } from '../db';
import { eventBus } from '../events/bus';
import type { EventBus } from '../events/bus';

/**
 * Context available to all tRPC procedures.
 */
export type Context = {
  /** Repository context for data access */
  repos: TransactionalRepositoryContext;

  /** Prism for all mutations */
  prism: Prism;

  /** Authentication context (null if not authenticated) */
  auth: AuthContext | null;

  /** Event bus for real-time notifications */
  eventBus: EventBus;

  /** The raw request (for headers, etc.) */
  req: Request;
};

/**
 * Options for creating context.
 */
export type CreateContextOptions = {
  req: Request;
};

// Lazy-initialized audit store singleton
let auditStore: ReturnType<typeof createInMemoryAuditStore> | null = null;

function getAuditStore() {
  if (!auditStore) {
    auditStore = createInMemoryAuditStore();
  }
  return auditStore;
}

/**
 * Create the tRPC context for a request.
 *
 * This is called for each incoming request and provides:
 * - repos: Data access layer
 * - prism: Mutation interface (all writes go through Prism)
 * - auth: The authenticated user/agent context
 * - eventBus: For publishing real-time events
 */
export async function createContext(opts: CreateContextOptions): Promise<Context> {
  const { req } = opts;

  // Get authentication context from request
  const authResult = getAuthFromRequest(req);
  const auth = authResult.success ? authResult.auth : null;

  // Get repository context (creates db connection if needed)
  const repos = getRepositoryContext();

  // Create Prism instance for this request
  // Prism handles all mutations with audit logging
  const prism = createPrism({
    repos,
    auditStore: getAuditStore(),
    config: {
      auditEnabled: true,
      transactionsEnabled: true,
      // Callback to publish events when audit entries are created
      onAudit: async (entry) => {
        // Map audit entries to system events for real-time subscriptions
        // This is a simplified mapping - production would be more sophisticated
        if (entry.success && entry.resourceId) {
          // Events are published from individual routers for better control
          // This hook is available for cross-cutting concerns
        }
      },
    },
  });

  return {
    repos,
    prism,
    auth,
    eventBus,
    req,
  };
}

/**
 * Create context from a Next.js App Router request.
 */
export function createContextFromRequest(req: Request): Promise<Context> {
  return createContext({ req });
}
