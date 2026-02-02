// tRPC initialization
//
// Sets up tRPC with superjson transformer for proper Date/Map/Set serialization.
// This is the foundation for type-safe API routes.

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';

/**
 * Initialize tRPC with context and superjson transformer.
 *
 * The superjson transformer ensures that dates, maps, sets, and other
 * complex types are properly serialized across the wire.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Include the error code for client-side handling
        code: error.code,
      },
    };
  },
});

/**
 * Export router factory.
 */
export const router = t.router;

/**
 * Export procedure helpers.
 *
 * - publicProcedure: No auth required (for health checks, etc.)
 * - procedure: Base procedure for building custom middleware chains
 */
export const publicProcedure = t.procedure;

/**
 * Export middleware factory.
 */
export const middleware = t.middleware;

/**
 * Export merge routers helper.
 */
export const mergeRouters = t.mergeRouters;

/**
 * Re-export TRPCError for use in routers.
 */
export { TRPCError };
