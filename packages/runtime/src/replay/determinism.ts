// Determinism Checking
//
// Utilities to verify that policies produce identical results given identical inputs.
// Per spec §0.5: "Policies MUST be pure, deterministic, and side-effect free."
//
// Non-deterministic policies break replay - if replaying the same observation
// produces different effects, the system cannot be reconstructed from canon.

import type { Policy, Effect, Observation } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import { evaluatePolicy, type EvaluatePolicyOptions } from '../policies/index.js';

/**
 * Pattern that may indicate non-deterministic behavior
 */
export type NonDeterministicPattern = {
  /**
   * Pattern name
   */
  name: string;

  /**
   * Description of why this pattern is problematic
   */
  description: string;

  /**
   * Regex or string pattern to detect
   */
  pattern: RegExp;

  /**
   * Severity level
   */
  severity: 'warning' | 'error';

  /**
   * Line number in the policy code (if detected)
   */
  lineNumber?: number;

  /**
   * The matching code snippet
   */
  matchedCode?: string;
};

/**
 * Options for determinism checking
 */
export type DeterminismCheckOptions = {
  /**
   * Number of times to evaluate the policy (default: 3)
   */
  iterations?: number;

  /**
   * Fixed timestamp to use for all evaluations
   */
  evaluatedAt?: string;

  /**
   * Timeout for each policy evaluation in milliseconds
   */
  timeoutMs?: number;

  /**
   * Whether to check for non-deterministic patterns in code
   */
  checkPatterns?: boolean;
};

/**
 * Result of a determinism check
 */
export type DeterminismCheckResult = {
  /**
   * Whether the policy is deterministic
   */
  isDeterministic: boolean;

  /**
   * The policy that was checked
   */
  policy: Policy;

  /**
   * Number of iterations performed
   */
  iterations: number;

  /**
   * Effects from each iteration (should all be identical if deterministic)
   */
  effectsByIteration: Effect[][];

  /**
   * Differences found between iterations (empty if deterministic)
   */
  differences: string[];

  /**
   * Non-deterministic patterns detected in the policy code
   */
  detectedPatterns: NonDeterministicPattern[];

  /**
   * Total time for the check in milliseconds
   */
  durationMs: number;
};

/**
 * Known non-deterministic patterns to detect in policy code
 */
const NON_DETERMINISTIC_PATTERNS: Omit<NonDeterministicPattern, 'lineNumber' | 'matchedCode'>[] = [
  {
    name: 'Date.now()',
    description: 'Returns current time, which changes on each invocation',
    pattern: /\bDate\.now\s*\(\s*\)/g,
    severity: 'error',
  },
  {
    name: 'new Date()',
    description:
      'Creates a Date with current time when no argument is provided. Use ctx.evaluatedAt instead.',
    pattern: /\bnew\s+Date\s*\(\s*\)/g,
    severity: 'error',
  },
  {
    name: 'Math.random()',
    description: 'Random number generation breaks determinism',
    pattern: /\bMath\.random\s*\(\s*\)/g,
    severity: 'error',
  },
  {
    name: 'crypto.randomUUID()',
    description: 'UUID generation breaks determinism',
    pattern: /\bcrypto\.randomUUID\s*\(\s*\)/g,
    severity: 'error',
  },
  {
    name: 'crypto.getRandomValues',
    description: 'Random value generation breaks determinism',
    pattern: /\bcrypto\.getRandomValues\s*\(/g,
    severity: 'error',
  },
  {
    name: 'setTimeout/setInterval',
    description: 'Timer-based operations are non-deterministic and side-effectful',
    pattern: /\b(setTimeout|setInterval)\s*\(/g,
    severity: 'error',
  },
  {
    name: 'fetch()',
    description: 'Network requests are side effects and non-deterministic',
    pattern: /\bfetch\s*\(/g,
    severity: 'error',
  },
  {
    name: 'XMLHttpRequest',
    description: 'Network requests are side effects and non-deterministic',
    pattern: /\bnew\s+XMLHttpRequest\s*\(/g,
    severity: 'error',
  },
  {
    name: 'console.*',
    description: 'Console output is a side effect. Use the log effect instead.',
    pattern: /\bconsole\.(log|warn|error|info|debug)\s*\(/g,
    severity: 'warning',
  },
  {
    name: 'process.env',
    description: 'Environment variables may differ between replays',
    pattern: /\bprocess\.env\b/g,
    severity: 'warning',
  },
  {
    name: 'global/window mutation',
    description: 'Mutating global state breaks determinism',
    pattern: /\b(global|window|globalThis)\s*\.\s*\w+\s*=/g,
    severity: 'error',
  },
];

/**
 * Detect non-deterministic patterns in policy code.
 *
 * Scans the policy implementation code for patterns that may indicate
 * non-deterministic behavior.
 *
 * @param policy - The policy to check
 * @returns Detected patterns
 */
export function detectNonDeterministicPatterns(policy: Policy): NonDeterministicPattern[] {
  const detected: NonDeterministicPattern[] = [];

  if (policy.implementation.kind !== 'typescript') {
    return detected;
  }

  const code = policy.implementation.code;
  const lines = code.split('\n');

  for (const patternDef of NON_DETERMINISTIC_PATTERNS) {
    // Reset regex lastIndex for global patterns
    patternDef.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = patternDef.pattern.exec(code)) !== null) {
      // Find line number
      let lineNumber = 1;
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length >= match.index) {
          lineNumber = i + 1;
          break;
        }
        charCount += lines[i].length + 1; // +1 for newline
      }

      detected.push({
        ...patternDef,
        lineNumber,
        matchedCode: match[0],
      });
    }
  }

  return detected;
}

/**
 * Compare two arrays of effects for equality.
 *
 * @param effects1 - First effect array
 * @param effects2 - Second effect array
 * @returns Differences found (empty if equal)
 */
function compareEffects(effects1: Effect[], effects2: Effect[]): string[] {
  const differences: string[] = [];

  if (effects1.length !== effects2.length) {
    differences.push(`Different number of effects: ${effects1.length} vs ${effects2.length}`);
    return differences;
  }

  for (let i = 0; i < effects1.length; i++) {
    const e1 = effects1[i];
    const e2 = effects2[i];

    const str1 = JSON.stringify(e1, Object.keys(e1).sort());
    const str2 = JSON.stringify(e2, Object.keys(e2).sort());

    if (str1 !== str2) {
      differences.push(`Effect ${i} differs: ${str1} vs ${str2}`);
    }
  }

  return differences;
}

/**
 * Check if a policy produces deterministic results.
 *
 * Evaluates the policy multiple times with the same input and verifies
 * that the effects are identical each time.
 *
 * @param repos - Repository context
 * @param policy - Policy to check
 * @param observation - Test observation to use
 * @param options - Check options
 * @returns Determinism check result
 *
 * @example
 * ```typescript
 * // Check a policy for determinism
 * const result = await checkPolicyDeterminism(repos, policy, observation, {
 *   iterations: 5,
 *   checkPatterns: true,
 * });
 *
 * if (!result.isDeterministic) {
 *   console.error('Policy is non-deterministic!');
 *   console.error('Differences:', result.differences);
 *   console.error('Detected patterns:', result.detectedPatterns);
 * }
 * ```
 */
export async function checkPolicyDeterminism(
  repos: RepositoryContext,
  policy: Policy,
  observation: Observation,
  options: DeterminismCheckOptions = {}
): Promise<DeterminismCheckResult> {
  const startTime = Date.now();
  const {
    iterations = 3,
    evaluatedAt = new Date().toISOString(),
    timeoutMs,
    checkPatterns = true,
  } = options;

  // Detect patterns in code
  const detectedPatterns = checkPatterns ? detectNonDeterministicPatterns(policy) : [];

  // Evaluate policy multiple times
  const effectsByIteration: Effect[][] = [];
  const evalOptions: EvaluatePolicyOptions = {
    evaluatedAt,
    timeoutMs,
  };

  for (let i = 0; i < iterations; i++) {
    const result = await evaluatePolicy(repos, policy, observation, evalOptions);
    effectsByIteration.push(result.effects);
  }

  // Compare all iterations to the first
  const differences: string[] = [];
  const referenceEffects = effectsByIteration[0];

  for (let i = 1; i < effectsByIteration.length; i++) {
    const iterDiffs = compareEffects(referenceEffects, effectsByIteration[i]);
    if (iterDiffs.length > 0) {
      differences.push(`Iteration ${i + 1} differs from iteration 1:`);
      differences.push(...iterDiffs.map((d) => `  ${d}`));
    }
  }

  // Consider non-deterministic if either:
  // 1. Actual differences were found between iterations
  // 2. Error-severity patterns were detected in code
  const hasErrorPatterns = detectedPatterns.some((p) => p.severity === 'error');
  const isDeterministic = differences.length === 0 && !hasErrorPatterns;

  return {
    isDeterministic,
    policy,
    iterations,
    effectsByIteration,
    differences,
    detectedPatterns,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Batch check multiple policies for determinism.
 *
 * @param repos - Repository context
 * @param policies - Policies to check
 * @param observation - Test observation to use
 * @param options - Check options
 * @returns Map of policy ID to check result
 */
export async function checkPoliciesDeterminism(
  repos: RepositoryContext,
  policies: Policy[],
  observation: Observation,
  options: DeterminismCheckOptions = {}
): Promise<{
  totalChecked: number;
  deterministicCount: number;
  nonDeterministicCount: number;
  results: Map<string, DeterminismCheckResult>;
}> {
  const results = new Map<string, DeterminismCheckResult>();
  let deterministicCount = 0;
  let nonDeterministicCount = 0;

  for (const policy of policies) {
    const result = await checkPolicyDeterminism(repos, policy, observation, options);
    results.set(policy.id, result);

    if (result.isDeterministic) {
      deterministicCount++;
    } else {
      nonDeterministicCount++;
    }
  }

  return {
    totalChecked: policies.length,
    deterministicCount,
    nonDeterministicCount,
    results,
  };
}

/**
 * Create a deterministic test observation.
 *
 * Useful for creating consistent test inputs for determinism checks.
 *
 * @param nodeId - Node ID for the observation
 * @param type - Observation type
 * @param payload - Observation payload
 * @returns A deterministic observation
 */
export function createTestObservation(
  nodeId: string,
  type: string,
  payload: unknown = {}
): Observation {
  return {
    id: 'test-obs-' + nodeId + '-' + type,
    nodeId,
    type,
    timestamp: '2024-01-15T00:00:00.000Z', // Fixed timestamp
    payload,
    provenance: {
      sourceId: nodeId,
      method: 'test',
    },
    tags: [],
  };
}
