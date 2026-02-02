// tRPC HTTP handler for Next.js App Router
//
// This route handles all tRPC requests at /api/trpc/*
// It uses the fetch adapter for compatibility with Edge runtime.

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/src/lib/trpc/routers';
import { createContextFromRequest } from '@/src/lib/trpc/context';

/**
 * Handle tRPC requests.
 *
 * The [trpc] dynamic segment captures the procedure path,
 * e.g., /api/trpc/nodes.get becomes procedure path "nodes.get"
 */
const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContextFromRequest(req),
    onError({ error, path }) {
      // Log errors in development
      if (process.env.NODE_ENV === 'development') {
        console.error(`tRPC error on ${path}:`, error);
      }
    },
  });
};

// Export handlers for GET and POST
export { handler as GET, handler as POST };
