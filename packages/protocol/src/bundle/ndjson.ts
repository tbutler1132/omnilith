// NDJSON (Newline Delimited JSON) helpers
// Used for append-only logs in Omnilith Bundles

/**
 * Parse an NDJSON string into an array of objects
 */
export function parseNdjson<T>(content: string): T[] {
  if (!content.trim()) {
    return [];
  }

  const lines = content.split('\n');
  const results: T[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    try {
      results.push(JSON.parse(line) as T);
    } catch (error) {
      throw new Error(
        `Failed to parse NDJSON at line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return results;
}

/**
 * Stringify an array of objects to NDJSON format
 */
export function stringifyNdjson<T>(items: T[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n') + (items.length > 0 ? '\n' : '');
}

/**
 * Stringify a single item as an NDJSON line (for appending)
 */
export function stringifyNdjsonLine<T>(item: T): string {
  return JSON.stringify(item) + '\n';
}

/**
 * Create an async generator that yields parsed NDJSON items from a stream
 * Useful for processing large log files without loading everything into memory
 */
export async function* parseNdjsonStream<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      // Process any remaining content in the buffer
      const line = buffer.trim();
      if (line) {
        yield JSON.parse(line) as T;
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    const lines = buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        yield JSON.parse(trimmed) as T;
      }
    }
  }
}

/**
 * Validation result for NDJSON content
 */
export type NdjsonValidationResult = {
  valid: boolean;
  lineCount: number;
  errors: Array<{
    line: number;
    error: string;
  }>;
};

/**
 * Validate NDJSON content without parsing all items
 * Returns validation result with any errors found
 */
export function validateNdjson(content: string): NdjsonValidationResult {
  const lines = content.split('\n');
  const errors: Array<{ line: number; error: string }> = [];
  let validLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      JSON.parse(line);
      validLineCount++;
    } catch (error) {
      errors.push({
        line: i + 1,
        error: error instanceof Error ? error.message : 'Unknown parse error',
      });
    }
  }

  return {
    valid: errors.length === 0,
    lineCount: validLineCount,
    errors,
  };
}
