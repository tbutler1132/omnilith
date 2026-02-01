// Observation ingestion - the entry point for all signals into the system

import type { Observation, Provenance } from '@omnilith/protocol';
import type { RepositoryContext, AppendObservationInput } from '@omnilith/repositories';
import {
  ValidationError,
  ProvenanceError,
  NodeNotFoundError,
  InvalidObservationTypeError,
} from '../errors.js';

/**
 * Input for ingesting a new observation.
 * This is the raw input before validation and processing.
 */
export type IngestObservationInput = {
  /** Target node for the observation */
  nodeId: string;

  /** Hierarchical type string (e.g., "health.sleep", "work.task.completed") */
  type: string;

  /** The observation data - structure depends on type */
  payload: unknown;

  /** Origin and attribution metadata (REQUIRED) */
  provenance: Provenance;

  /** Optional timestamp, defaults to now */
  timestamp?: string;

  /** Optional tags for categorization */
  tags?: string[];
};

/**
 * Result of successful observation ingestion.
 */
export type IngestObservationResult = {
  /** The persisted observation with generated ID */
  observation: Observation;

  /** Whether this is a new observation or a duplicate was detected */
  created: boolean;
};

/**
 * Options for observation ingestion.
 */
export type IngestObservationOptions = {
  /**
   * Whether to validate that the node exists.
   * Defaults to true. Set to false for batch imports where you trust the data.
   */
  validateNode?: boolean;

  /**
   * Whether to validate the source node exists.
   * Defaults to true.
   */
  validateSource?: boolean;
};

/**
 * Validate that an observation type follows the hierarchical naming convention.
 * Valid examples: "health.sleep", "work.task.completed", "sensor.temperature"
 * Invalid examples: "", ".sleep", "health.", "health..sleep", "HEALTH.SLEEP"
 */
function validateObservationType(type: string): void {
  if (!type || typeof type !== 'string') {
    throw new InvalidObservationTypeError(type ?? '', 'type is required');
  }

  if (type.startsWith('.') || type.endsWith('.')) {
    throw new InvalidObservationTypeError(
      type,
      'type cannot start or end with a dot'
    );
  }

  if (type.includes('..')) {
    throw new InvalidObservationTypeError(
      type,
      'type cannot contain consecutive dots'
    );
  }

  // Check for valid characters (lowercase letters, numbers, dots, underscores)
  const validTypePattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
  if (!validTypePattern.test(type)) {
    throw new InvalidObservationTypeError(
      type,
      'type must be lowercase, start with a letter, and use dots as separators (e.g., "health.sleep")'
    );
  }
}

/**
 * Validate provenance fields.
 * Provenance is mandatory on every observation per protocol spec.
 */
function validateProvenance(provenance: unknown): asserts provenance is Provenance {
  if (!provenance || typeof provenance !== 'object') {
    throw new ProvenanceError('provenance is required', 'provenance');
  }

  const prov = provenance as Record<string, unknown>;

  if (!prov.sourceId || typeof prov.sourceId !== 'string') {
    throw new ProvenanceError(
      'provenance.sourceId is required and must be a string',
      'provenance.sourceId'
    );
  }

  if (prov.sourceId.trim() === '') {
    throw new ProvenanceError(
      'provenance.sourceId cannot be empty',
      'provenance.sourceId'
    );
  }

  // Validate optional fields
  if (prov.sponsorId !== undefined && typeof prov.sponsorId !== 'string') {
    throw new ProvenanceError(
      'provenance.sponsorId must be a string if provided',
      'provenance.sponsorId'
    );
  }

  if (prov.method !== undefined && typeof prov.method !== 'string') {
    throw new ProvenanceError(
      'provenance.method must be a string if provided',
      'provenance.method'
    );
  }

  if (prov.confidence !== undefined) {
    if (typeof prov.confidence !== 'number') {
      throw new ProvenanceError(
        'provenance.confidence must be a number if provided',
        'provenance.confidence'
      );
    }
    if (prov.confidence < 0 || prov.confidence > 1) {
      throw new ProvenanceError(
        'provenance.confidence must be between 0 and 1',
        'provenance.confidence'
      );
    }
  }
}

/**
 * Validate basic observation input fields.
 */
function validateObservationInput(input: unknown): asserts input is IngestObservationInput {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('observation input is required');
  }

  const obs = input as Record<string, unknown>;

  // Validate nodeId
  if (!obs.nodeId || typeof obs.nodeId !== 'string') {
    throw new ValidationError('nodeId is required and must be a string', {
      field: 'nodeId',
    });
  }

  if (obs.nodeId.trim() === '') {
    throw new ValidationError('nodeId cannot be empty', { field: 'nodeId' });
  }

  // Validate type
  validateObservationType(obs.type as string);

  // Validate payload exists (can be any value including null)
  if (obs.payload === undefined) {
    throw new ValidationError('payload is required', { field: 'payload' });
  }

  // Validate provenance
  validateProvenance(obs.provenance);

  // Validate optional timestamp
  if (obs.timestamp !== undefined) {
    if (typeof obs.timestamp !== 'string') {
      throw new ValidationError('timestamp must be a string if provided', {
        field: 'timestamp',
      });
    }
    // Try to parse as ISO 8601
    const date = new Date(obs.timestamp);
    if (isNaN(date.getTime())) {
      throw new ValidationError('timestamp must be a valid ISO 8601 date string', {
        field: 'timestamp',
        details: { value: obs.timestamp },
      });
    }
  }

  // Validate optional tags
  if (obs.tags !== undefined) {
    if (!Array.isArray(obs.tags)) {
      throw new ValidationError('tags must be an array if provided', {
        field: 'tags',
      });
    }
    for (const tag of obs.tags) {
      if (typeof tag !== 'string') {
        throw new ValidationError('each tag must be a string', {
          field: 'tags',
          details: { invalidTag: tag },
        });
      }
    }
  }
}

/**
 * Ingest an observation into the system.
 *
 * This is the entry point for all signals. It validates the observation,
 * enforces provenance requirements, and appends to the observation log.
 *
 * @param repos - Repository context for data access
 * @param input - The observation to ingest
 * @param options - Optional configuration
 * @returns The persisted observation with generated ID
 * @throws ValidationError if the observation is malformed
 * @throws ProvenanceError if provenance is missing or invalid
 * @throws NodeNotFoundError if the target node doesn't exist
 *
 * @example
 * ```typescript
 * const result = await ingestObservation(repos, {
 *   nodeId: 'node-123',
 *   type: 'health.sleep',
 *   payload: { hours: 7.5, quality: 'good' },
 *   provenance: { sourceId: 'node-123', method: 'manual_entry' },
 *   tags: ['sleep', 'health'],
 * });
 * console.log(result.observation.id); // Generated UUID
 * ```
 */
export async function ingestObservation(
  repos: RepositoryContext,
  input: IngestObservationInput,
  options: IngestObservationOptions = {}
): Promise<IngestObservationResult> {
  const { validateNode = true, validateSource = true } = options;

  // Validate input shape and required fields
  validateObservationInput(input);

  // Validate that the target node exists
  if (validateNode) {
    const node = await repos.nodes.get(input.nodeId);
    if (!node) {
      throw new NodeNotFoundError(input.nodeId);
    }
  }

  // Validate that the source node exists (the one creating the observation)
  if (validateSource) {
    const sourceNode = await repos.nodes.get(input.provenance.sourceId);
    if (!sourceNode) {
      throw new NodeNotFoundError(input.provenance.sourceId);
    }

    // If there's a sponsor, validate it exists too
    if (input.provenance.sponsorId) {
      const sponsorNode = await repos.nodes.get(input.provenance.sponsorId);
      if (!sponsorNode) {
        throw new NodeNotFoundError(input.provenance.sponsorId);
      }
    }
  }

  // Prepare the input for the repository
  const appendInput: AppendObservationInput = {
    nodeId: input.nodeId,
    type: input.type,
    payload: input.payload,
    provenance: input.provenance,
    timestamp: input.timestamp,
    tags: input.tags,
  };

  // Append to the observation log
  const observation = await repos.observations.append(appendInput);

  return {
    observation,
    created: true,
  };
}

/**
 * Batch ingest multiple observations.
 * Validates all observations first, then appends them in order.
 * If any observation fails validation, none are appended.
 *
 * @param repos - Repository context for data access
 * @param inputs - Array of observations to ingest
 * @param options - Optional configuration
 * @returns Array of results in the same order as inputs
 * @throws ValidationError if any observation is malformed (no partial success)
 */
export async function ingestObservations(
  repos: RepositoryContext,
  inputs: IngestObservationInput[],
  options: IngestObservationOptions = {}
): Promise<IngestObservationResult[]> {
  // Validate all inputs first (fail fast)
  for (let i = 0; i < inputs.length; i++) {
    try {
      validateObservationInput(inputs[i]);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          `Observation at index ${i}: ${error.message}`,
          { field: error.field, details: { index: i, ...error.details } }
        );
      }
      throw error;
    }
  }

  // Collect unique node IDs to validate
  if (options.validateNode !== false || options.validateSource !== false) {
    const nodeIdsToValidate = new Set<string>();

    for (const input of inputs) {
      if (options.validateNode !== false) {
        nodeIdsToValidate.add(input.nodeId);
      }
      if (options.validateSource !== false) {
        nodeIdsToValidate.add(input.provenance.sourceId);
        if (input.provenance.sponsorId) {
          nodeIdsToValidate.add(input.provenance.sponsorId);
        }
      }
    }

    // Validate all unique nodes exist
    for (const nodeId of nodeIdsToValidate) {
      const node = await repos.nodes.get(nodeId);
      if (!node) {
        throw new NodeNotFoundError(nodeId);
      }
    }
  }

  // Append all observations
  const results: IngestObservationResult[] = [];
  for (const input of inputs) {
    const observation = await repos.observations.append({
      nodeId: input.nodeId,
      type: input.type,
      payload: input.payload,
      provenance: input.provenance,
      timestamp: input.timestamp,
      tags: input.tags,
    });
    results.push({ observation, created: true });
  }

  return results;
}
