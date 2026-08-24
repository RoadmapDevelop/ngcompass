import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Err, type BaselineFile, type Result } from '@ngcompass/common';
import type { BaselineError } from '../models/index.js';
import { parseBaseline } from './format.js';

export function resolveBaselinePath(
  baselinePath: string,
  rootDir: string
): string {
  return path.isAbsolute(baselinePath)
    ? baselinePath
    : path.resolve(rootDir, baselinePath);
}

export async function loadBaseline(
  baselinePath: string,
  rootDir: string
): Promise<Result<BaselineFile, BaselineError>> {
  const absolutePath = resolveBaselinePath(baselinePath, rootDir);

  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf8');
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return Err({ kind: 'BaselineNotFound', path: absolutePath });
    }
    return Err({
      kind: 'BaselineUnreadable',
      path: absolutePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  return parseBaseline(raw, absolutePath);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
