// tRPC middleware for authentication and authorization
//
// These middleware functions enforce auth requirements on procedures.

import { middleware, publicProcedure, TRPCError } from './index';
import type { Context } from './context';

/**
 * Middleware that requires authentication.
 *
 * Ensures ctx.auth is not null and passes the authenticated context
 * to downstream procedures.
 */
const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      // Narrow the type to indicate auth is definitely set
      auth: ctx.auth,
    },
  });
});

/**
 * Middleware that requires a subject node (not an agent).
 *
 * Some operations (like delegating authority) can only be done by subjects.
 */
const isSubjectNode = middleware(async ({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  if (ctx.auth.kind !== 'subject') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This operation requires a subject node, not an agent',
    });
  }

  return next({
    ctx: {
      ...ctx,
      auth: ctx.auth,
    },
  });
});

/**
 * Create middleware that requires specific scopes.
 *
 * @param requiredScopes Scopes that must be present
 */
function requiresScopes(...requiredScopes: string[]) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.auth) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Subject nodes have all scopes by default
    if (ctx.auth.kind === 'subject') {
      return next({ ctx: { ...ctx, auth: ctx.auth } });
    }

    // Agent nodes need to have the required scopes delegated
    const agentScopes = ctx.auth.scopes ?? [];
    const missingScopes = requiredScopes.filter((s) => !agentScopes.includes(s));

    if (missingScopes.length > 0) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Missing required scopes: ${missingScopes.join(', ')}`,
      });
    }

    return next({ ctx: { ...ctx, auth: ctx.auth } });
  });
}

/**
 * Protected procedure - requires authentication.
 */
export const protectedProcedure = publicProcedure.use(isAuthenticated);

/**
 * Subject-only procedure - requires subject node auth.
 */
export const subjectProcedure = publicProcedure.use(isSubjectNode);

/**
 * Create a procedure that requires specific scopes.
 */
export function scopedProcedure(...scopes: string[]) {
  return publicProcedure.use(requiresScopes(...scopes));
}

/**
 * Type for authenticated context (after isAuthenticated middleware).
 */
export type AuthenticatedContext = Omit<Context, 'auth'> & {
  auth: NonNullable<Context['auth']>;
};
