// tRPC client for React
//
// Provides typed hooks for querying and mutating data via tRPC.
// Integrates with React Query for caching and optimistic updates.

'use client';

import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './routers/index';

/**
 * tRPC React client with typed hooks.
 *
 * Usage in components:
 * ```tsx
 * import { trpc } from '@/lib/trpc/client';
 *
 * function MyComponent() {
 *   const { data: node } = trpc.nodes.get.useQuery({ id: 'node-1' });
 *   const createArtifact = trpc.artifacts.create.useMutation();
 *
 *   return (
 *     <button onClick={() => createArtifact.mutate({ ... })}>
 *       Create
 *     </button>
 *   );
 * }
 * ```
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Get the base URL for API requests.
 * Works in both browser and server environments.
 */
function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser: use relative path
    return '';
  }
  // SSR: use absolute URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Development
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Create the tRPC client with appropriate configuration.
 *
 * Uses:
 * - httpBatchLink for efficient request batching
 * - superjson for proper serialization of Dates, Maps, etc.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
        // Include credentials for auth cookies
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include',
          });
        },
      }),
    ],
  });
}

/**
 * Type for the tRPC client instance.
 */
export type TRPCClient = ReturnType<typeof createTRPCClient>;
