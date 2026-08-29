import { Err, Ok, type BaselineFile, type Result } from '@ngcompass/common';
import type { BaselineError } from '../models/index.js';

export const BASELINE_VERSION = 1;

const INDENT = 2;

export function createEmptyBaseline(): BaselineFile {
  return { version: BASELINE_VERSION, entries: {} };
}

export function serializeBaseline(baseline: BaselineFile): string {
  const sortedFiles = Object.keys(baseline.entries).sort();
  const entries: Record<string, Record<string, number>> = {};

  for (const filePath of sortedFiles) {
    const counts = baseline.entries[filePath];
    if (!counts) continue;

    const sortedRules = Object.keys(counts).sort();
    const ruleCounts: Record<string, number> = {};
    for (const ruleName of sortedRules) {
      const count = counts[ruleName];
      if (count === undefined || count <= 0) continue;
      ruleCounts[ruleName] = count;
    }

    if (Object.keys(ruleCounts).length > 0) {
      entries[filePath] = ruleCounts;
    }
  }

  const payload = { version: BASELINE_VERSION, entries };
  return `${JSON.stringify(payload, null, INDENT)}\n`;
}

export function parseBaseline(
  raw: string,
  filePath: string
): Result<BaselineFile, BaselineError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    return Err({
      kind: 'BaselineMalformed',
      path: filePath,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isRecord(parsed)) {
    return Err({
      kind: 'BaselineMalformed',
      path: filePath,
      detail: 'Expected a JSON object at the top level',
    });
  }

  const version = parsed['version'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return Err({
      kind: 'BaselineMalformed',
      path: filePath,
      detail: 'Missing or non-integer "version" field',
    });
  }

  if (version !== BASELINE_VERSION) {
    return Err({
      kind: 'BaselineVersionUnsupported',
      path: filePath,
      found: version,
      supported: BASELINE_VERSION,
    });
  }

  const entries = parsed['entries'];
  if (!isRecord(entries)) {
    return Err({
      kind: 'BaselineMalformed',
      path: filePath,
      detail: 'Missing or non-object "entries" field',
    });
  }

  const validated: Record<string, Record<string, number>> = {};
  for (const fileKey of Object.keys(entries)) {
    const counts = entries[fileKey];
    if (!isRecord(counts)) {
      return Err({
        kind: 'BaselineMalformed',
        path: filePath,
        detail: `Entry "${fileKey}" is not an object of rule counts`,
      });
    }

    const ruleCounts: Record<string, number> = {};
    for (const ruleName of Object.keys(counts)) {
      const count = counts[ruleName];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        return Err({
          kind: 'BaselineMalformed',
          path: filePath,
          detail: `Count for "${fileKey}" / "${ruleName}" must be a non-negative integer`,
        });
      }
      if (count > 0) {
        ruleCounts[ruleName] = count;
      }
    }

    if (Object.keys(ruleCounts).length > 0) {
      validated[fileKey] = ruleCounts;
    }
  }

  return Ok({ version, entries: validated });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
