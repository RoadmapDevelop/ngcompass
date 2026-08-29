import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Err, Ok, type BaselineFile, type Result } from '@ngcompass/common';
import type { BaselineError } from '../models/index.js';
import { serializeBaseline } from './format.js';
import { resolveBaselinePath } from './read.js';

export async function saveBaseline(
  baseline: BaselineFile,
  baselinePath: string,
  rootDir: string
): Promise<Result<string, BaselineError>> {
  const absolutePath = resolveBaselinePath(baselinePath, rootDir);

  try {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, serializeBaseline(baseline), 'utf8');
  } catch (error: unknown) {
    return Err({
      kind: 'BaselineWriteFailed',
      path: absolutePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  return Ok(absolutePath);
}
