import { promises as fs } from 'node:fs';
import path from 'node:path';
import { debug, Locator } from '@ngcompass/common';
import { parseTs } from '@ngcompass/ast';
import { computeFileComplexity } from './complexity-analyzer.js';
import type {
  FileComplexity,
  ProjectComplexityOptions,
} from '../models/index.js';
const DEFAULT_CONCURRENCY = 32;
const PROGRESS_BATCH = 100;
const TS_LIKE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

function isTsLike(file: string): boolean {
  return TS_LIKE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function toRelative(file: string, rootDir: string): string {
  const relative = path.relative(rootDir, file);
  return (relative || file).replace(/\\/g, '/');
}

async function analyzeFile(
  file: string,
  rootDir: string
): Promise<FileComplexity | null> {
  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (error: unknown) {
    debug('engine', `Complexity skipped unreadable file ${file}: ${String(error)}`);
    return null;
  }

  try {
    const { program } = parseTs(content, file);
    const functions = computeFileComplexity(program, new Locator(content));
    if (functions.length === 0) return null;
    return { filePath: toRelative(file, rootDir), functions };
  } catch (error: unknown) {
    debug('engine', `Complexity skipped unparseable file ${file}: ${String(error)}`);
    return null;
  }
}

export async function computeProjectComplexity(
  files: readonly string[],
  options: ProjectComplexityOptions
): Promise<readonly FileComplexity[]> {
  const start = performance.now();

  const tsLikeFiles: string[] = [];
  for (const file of files) {
    if (isTsLike(file)) tsLikeFiles.push(path.resolve(options.rootDir, file));
  }

  const total = tsLikeFiles.length;
  const results: FileComplexity[] = [];
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  let cursor = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= total) return;

      const fileResult = await analyzeFile(tsLikeFiles[index], options.rootDir);
      if (fileResult) results.push(fileResult);

      completed++;
      if (options.onProgress && completed % PROGRESS_BATCH === 0) {
        options.onProgress(completed, total);
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (options.onProgress) options.onProgress(total, total);

  debug(
    'engine',
    `Complexity computed in ${(performance.now() - start).toFixed(2)}ms` +
      ` — ${total} files, ${results.length} with functions`
  );

  return results;
}
