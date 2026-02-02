// Development mode authentication
//
// For initial development, all requests are treated as coming from a
// default Subject-Node. This simplifies development while maintaining
// the actor context pattern that production auth will require.
//
// To switch to production auth:
// 1. Add jose or similar JWT library
// 2. Update getAuthFromRequest to verify JWT tokens
// 3. Set up token issuance in your auth flow

import type { AuthContext, AuthResult } from './types';

/**
 * Default node ID for development.
 * This node should exist in your development database.
 */
export const DEV_NODE_ID = 'dev-subject-node';

/**
 * Default auth context for development.
 */
export const DEV_AUTH: AuthContext = {
  nodeId: DEV_NODE_ID,
  kind: 'subject',
};

/**
 * Extract authentication context from a request.
 *
 * In development mode, always returns the dev auth context.
 * In production, this would verify a JWT from the Authorization header
 * or a session cookie.
 *
 * @param req The incoming request
 * @returns The authentication context
 */
export function getAuthFromRequest(_req: Request): AuthResult {
  // Check if we're in development mode
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // In development, always return the dev auth
    return { success: true, auth: DEV_AUTH };
  }

  // Production: would verify JWT from Authorization header or cookie
  // For now, reject in production until real auth is implemented
  //
  // Future implementation:
  // const authHeader = req.headers.get('Authorization');
  // if (authHeader?.startsWith('Bearer ')) {
  //   const token = authHeader.slice(7);
  //   const payload = await verifyJwt(token);
  //   return { success: true, auth: { nodeId: payload.sub, kind: payload.kind, ... } };
  // }
  //
  // const sessionCookie = req.cookies.get('session');
  // if (sessionCookie) {
  //   const payload = await verifySessionToken(sessionCookie.value);
  //   return { success: true, auth: { nodeId: payload.nodeId, kind: payload.kind, ... } };
  // }

  return {
    success: false,
    error: 'Authentication required. Production auth not yet implemented.',
  };
}

/**
 * Check if the current environment is in development mode.
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}
