// Root router - combines all domain routers
//
// This is the main entry point for the tRPC API.
// All routers are merged here to create the complete API surface.

import { router } from '../index';
import { nodesRouter } from './nodes';
import { artifactsRouter } from './artifacts';
import { surfacesRouter } from './surfaces';
import { variablesRouter } from './variables';
import { episodesRouter } from './episodes';
import { entitiesRouter } from './entities';
import { observationsRouter } from './observations';
import { actionsRouter } from './actions';
import { policiesRouter } from './policies';
import { grantsRouter } from './grants';

/**
 * The root router that combines all domain routers.
 *
 * Usage from client:
 * ```ts
 * // Query
 * const node = await trpc.nodes.get.query({ id: 'node-1' });
 *
 * // Mutation
 * const artifact = await trpc.artifacts.create.mutate({
 *   nodeId: 'node-1',
 *   title: 'My Document',
 *   ...
 * });
 * ```
 */
export const appRouter = router({
  // Core domain routers
  nodes: nodesRouter,
  artifacts: artifactsRouter,
  surfaces: surfacesRouter,
  variables: variablesRouter,
  episodes: episodesRouter,
  entities: entitiesRouter,
  observations: observationsRouter,
  actions: actionsRouter,
  policies: policiesRouter,
  grants: grantsRouter,
});

/**
 * Export the router type for client-side type inference.
 */
export type AppRouter = typeof appRouter;
