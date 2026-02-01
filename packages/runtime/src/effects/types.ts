// Effect execution types

import type { Effect, Observation, Id, RiskLevel } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';

/**
 * Context passed to effect handlers.
 * Contains all the information needed to execute an effect.
 */
export type EffectExecutionContext = {
  /**
   * Repository context for data access
   */
  repos: RepositoryContext;

  /**
   * The observation that triggered this effect chain
   */
  observation: Observation;

  /**
   * The policy that produced this effect
   */
  policyId: Id;

  /**
   * The node where the effect is being executed
   */
  nodeId: Id;

  /**
   * Timestamp of effect execution
   */
  executedAt: string;

  /**
   * Logger for structured logging
   */
  logger: EffectLogger;
};

/**
 * Structured logger interface for effect execution.
 * Implementations can route to console, file, or external services.
 */
export type EffectLogger = {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
};

/**
 * Result of executing a single effect
 */
export type EffectExecutionResult = {
  /**
   * The effect that was executed
   */
  effect: Effect;

  /**
   * Whether execution succeeded
   */
  success: boolean;

  /**
   * Error message if execution failed
   */
  error?: string;

  /**
   * Execution duration in milliseconds
   */
  durationMs: number;

  /**
   * Additional result data (varies by effect type)
   */
  data?: Record<string, unknown>;
};

/**
 * Result of executing multiple effects
 */
export type EffectsExecutionResult = {
  /**
   * Results for each effect
   */
  results: EffectExecutionResult[];

  /**
   * Count of successful executions
   */
  successCount: number;

  /**
   * Count of failed executions
   */
  failureCount: number;

  /**
   * Total execution duration in milliseconds
   */
  totalDurationMs: number;

  /**
   * Whether execution was suppressed
   */
  suppressed: boolean;

  /**
   * Suppress reason if applicable
   */
  suppressReason?: string;
};

/**
 * An effect handler processes a specific effect type.
 * Returns result data on success, throws on error.
 */
export type EffectHandler<T extends Effect = Effect> = (
  effect: T,
  ctx: EffectExecutionContext
) => Promise<Record<string, unknown> | void>;

/**
 * Options for proposing an action (used by propose_action handler)
 */
export type ProposeActionOptions = {
  /**
   * Override risk level (defaults to action definition risk level)
   */
  riskLevel?: RiskLevel;

  /**
   * Auto-approve if risk level allows
   */
  autoApprove?: boolean;
};

/**
 * Default console logger implementation
 */
export const consoleLogger: EffectLogger = {
  debug(message: string, data?: Record<string, unknown>) {
    console.debug(`[DEBUG] ${message}`, data ?? '');
  },
  info(message: string, data?: Record<string, unknown>) {
    console.info(`[INFO] ${message}`, data ?? '');
  },
  warn(message: string, data?: Record<string, unknown>) {
    console.warn(`[WARN] ${message}`, data ?? '');
  },
  error(message: string, data?: Record<string, unknown>) {
    console.error(`[ERROR] ${message}`, data ?? '');
  },
};

/**
 * Silent logger for testing
 */
export const silentLogger: EffectLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Create a capturing logger that stores log entries for inspection
 */
export type LogEntry = {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
};

export function createCapturingLogger(): EffectLogger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];

  const log = (level: LogEntry['level']) => (message: string, data?: Record<string, unknown>) => {
    entries.push({
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  };

  return {
    entries,
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
  };
}
