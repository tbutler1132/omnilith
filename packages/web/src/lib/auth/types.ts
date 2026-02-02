// Authentication context types for the API layer

import type { NodeKind } from '@omnilith/protocol';

/**
 * Authentication context available in API requests.
 *
 * This represents the authenticated caller's identity and permissions.
 * In development mode, this is a fixed dev user. In production, this
 * would be derived from a JWT token.
 */
export type AuthContext = {
  /** The authenticated node's ID */
  nodeId: string;

  /** The kind of node (subject or agent) */
  kind: Extract<NodeKind, 'subject' | 'agent'>;

  /** For agents, the sponsoring subject node */
  sponsorId?: string;

  /** Delegated scopes (for agents with limited authority) */
  scopes?: string[];
};

/**
 * Result of an authentication check.
 */
export type AuthResult =
  | { success: true; auth: AuthContext }
  | { success: false; error: string };
