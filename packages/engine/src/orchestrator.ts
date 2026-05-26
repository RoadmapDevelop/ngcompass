import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';

import { CacheContext } from '@ngcompass/cache';
import {
  AnalysisResult,
  Err,
  Ok,
  ParserOptions,
  Result,
  RuleResult,
} from '@ngcompass/common';
import {
  createInfrastructureError,
  debug,
  InfrastructureErrorCollector,
} from '@ngcompass/common';
import {
  ExecutionPlanOutput,
  groupTasksByFile,
  Task,
} from '@ngcompass/planner';
import pLimit from 'p-limit';

import { createAnalysisContext } from './analysis-context.js';
import { calculateStats } from './analysis-stats.js';
import {
  AnalysisFileProgress,
  buildFileProgress,
  isAnalysisFileProgress,
} from './progress.js';
import { executeBatchedTasks } from './runner.js';
import {
  createTypeAwareAnalysisContext,
  isTsProgramRoot,
} from './type-aware-context.js';
import { runAnalysisParallel } from './worker-pool.js';

const DEFAULT_TYPE_AWARE_CHUNK_SIZE = 100;
const DEFAULT_TYPE_AWARE_CONCURRENCY = 1;
const ABSOLUTE_MAX_TYPE_AWARE_CONCURRENCY = 4;
const DEFAULT_TYPE_AWARE_FILE_CONCURRENCY = 1;
const ABSOLUTE_MAX_TYPE_AWARE_FILE_CONCURRENCY = 8;
const LARGE_TYPE_AWARE_FILE_COUNT = 1000;
const LARGE_TYPE_AWARE_CHUNK_SIZE = 50;
const MAX_FULL_ANALYSIS_CACHE_RESULTS = 20_000;
const MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE = 10;
const ABSOLUTE_MAX_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE = 2000;
const HIGH_HEAP_PRESSURE_RATIO = 0.88;
const CRITICAL_HEAP_PRESSURE_RATIO = 0.94;
const LOW_HEAP_PRESSURE_RATIO = 0.35;
const ADAPTIVE_GROWTH_STREAK = 3;
const ISOLATED_TYPE_AWARE_FILE_COUNT = 500;
const TYPE_AWARE_CHILD_TIMEOUT_MS = 10 * 60 * 1000;
const DEPENDENCY_GROUPING_CONCURRENCY = 64;
const DEPENDENCY_GROUPING_TIMEOUT_MS = 5_000;

const DEFAULT_PARALLEL_THRESHOLD = 150;

export type { AnalysisFileProgress } from './progress.js';

interface TypeAwareChunkWork {
  readonly index: number;
  readonly tasks: ReadonlyArray<Task>;
  readonly files: ReadonlyArray<string>;
  readonly programRootFiles: ReadonlyArray<string>;
  readonly buildProjectContext: boolean;
}

export type { AnalysisContext } from './analysis-context.js';
export { createAnalysisContext } from './analysis-context.js';

function isRuleResult(value: unknown): value is RuleResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v['ruleName'] !== 'string') return false;
  if (!Array.isArray(v['failures'])) return false;
  for (const f of v['failures'] as unknown[]) {
    if (!f || typeof f !== 'object') return false;
    const failure = f as Record<string, unknown>;
    if (typeof failure['filePath'] !== 'string') return false;
    if (typeof failure['line'] !== 'number') return false;
    if (typeof failure['column'] !== 'number') return false;
    if (typeof failure['severity'] !== 'string') return false;
  }
  return true;
}

function isValidAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v['results'])) return false;
  if (!Array.isArray(v['parseErrors'])) return false;
  if (!v['stats'] || typeof v['stats'] !== 'object') return false;
  const stats = v['stats'] as Record<string, unknown>;
  if (typeof stats['totalFiles'] !== 'number') return false;
  if (typeof stats['totalErrors'] !== 'number') return false;
  if (typeof stats['totalWarnings'] !== 'number') return false;
  if (typeof stats['duration'] !== 'number') return false;
  return true;
}

export interface AnalysisOptions {
  readonly rootDir: string;

  readonly cache?: CacheContext;

  readonly debug?: boolean;

  readonly maxWorkers?: number;

  readonly parallelThreshold?: number;

  readonly errorCollector?: InfrastructureErrorCollector;

  readonly files?: ReadonlyArray<string>;

  readonly parserOptions?: ParserOptions;

  readonly typeAwareChunkSize?: number;

  readonly typeAwareIsolation?: 'auto' | 'process' | 'off';

  readonly typeAwareChunkStrategy?: 'dependency' | 'simple';

  readonly typeAwareConcurrency?: number;

  readonly typeAwareFileConcurrency?: number;

  readonly skipTypeCheck?: boolean;

  readonly onProgress?: (completed: number, total: number) => void;

  readonly onFileProgress?: (event: AnalysisFileProgress) => void;
}

export const runAnalysis = async (
  plan: ExecutionPlanOutput,
  options: AnalysisOptions
): Promise<Result<AnalysisResult>> => {
  try {
    if (plan.precomputedAnalysis) {
      if (!isValidAnalysisResult(plan.precomputedAnalysis)) {
        debug(
          'engine',
          'Precomputed analysis failed schema validation — discarding stale cache entry and re-running analysis'
        );
      } else {
        debug(
          'engine',
          'Returning precomputed analysis from cache (global hash match)'
        );
        return Ok(plan.precomputedAnalysis);
      }
    }

    const startTime = performance.now();
    const { tasks, skippedTasks, cachedResults } = plan;

    const cpuCount = os.cpus().length;
    const defaultWorkerCount = Math.max(1, Math.min(4, cpuCount - 1));
    const effectiveMaxWorkers = Math.max(
      1,
      Math.min(options.maxWorkers ?? defaultWorkerCount, cpuCount)
    );
    const parallelThreshold =
      options.parallelThreshold ?? DEFAULT_PARALLEL_THRESHOLD;

    const typeAwareTasks = tasks.filter(
      (t) => !!t.needsTypeChecker || !!t.needsProjectContext
    );
    const workerTasks = tasks.filter(
      (t) => !t.needsTypeChecker && !t.needsProjectContext
    );
    debug(
      'engine',
      `workerTasks: ${workerTasks.length}, typeAwareTasks: ${typeAwareTasks.length}`
    );

    const grandTotal = tasks.length + skippedTasks.length;

    let globalDone = skippedTasks.length;
    const notifyProgress = (delta: number) => {
      globalDone = Math.min(globalDone + delta, grandTotal);
      options.onProgress?.(globalDone, grandTotal);
    };
    if (skippedTasks.length > 0) options.onProgress?.(globalDone, grandTotal);

    let executedResults: RuleResult[] = [];

    if (workerTasks.length > 0) {
      if (workerTasks.length > parallelThreshold) {
        debug(
          'engine',
          `Running analysis on ${workerTasks.length} syntax-only tasks using workers (max: ${effectiveMaxWorkers})...`
        );
        const result = await runAnalysisParallel(
          workerTasks,
          options.rootDir,
          startTime,
          effectiveMaxWorkers,
          undefined,
          options.onFileProgress
        );
        if (result.ok) {
          executedResults = result.data.results as RuleResult[];
          notifyProgress(workerTasks.length);
        } else {
          return result;
        }
      } else {
        debug(
          'engine',
          `Running analysis on ${workerTasks.length} syntax-only tasks locally with batching (concurrency: ${effectiveMaxWorkers})...`
        );
        executedResults = await executeTasksLocally(
          workerTasks,
          options.rootDir,
          effectiveMaxWorkers,
          false,
          options.errorCollector,
          undefined,
          undefined,
          true,
          undefined,
          notifyProgress,
          options.onFileProgress
        );
      }
    }

    if (typeAwareTasks.length > 0 && !options.skipTypeCheck) {
      const typeAwareFileCount = groupTasksByFile(typeAwareTasks).size;
      const chunkSize =
        options.typeAwareChunkSize ??
        (typeAwareFileCount >= LARGE_TYPE_AWARE_FILE_COUNT
          ? LARGE_TYPE_AWARE_CHUNK_SIZE
          : DEFAULT_TYPE_AWARE_CHUNK_SIZE);
      const typeAwareConcurrency = getTypeAwareConcurrency(
        options.typeAwareConcurrency,
        effectiveMaxWorkers
      );
      const typeAwareFileConcurrency = getTypeAwareFileConcurrency(
        options.typeAwareFileConcurrency,
        effectiveMaxWorkers
      );
      const typeAwareResults = await executeTypeAwareTasks(
        typeAwareTasks,
        options.rootDir,
        typeAwareConcurrency,
        typeAwareFileConcurrency,
        chunkSize,
        options,
        notifyProgress,
        options.onFileProgress
      );
      executedResults = [...executedResults, ...typeAwareResults];
    } else if (typeAwareTasks.length > 0 && options.skipTypeCheck) {
      debug(
        'engine',
        `Skipping ${typeAwareTasks.length} type-aware tasks (--skip-type-check)`
      );
    }

    const skippedResults = await retrieveSkippedResults(
      skippedTasks,
      cachedResults,
      options.cache
    );

    const successful = [...executedResults, ...skippedResults];

    const totalTasks = tasks.length + skippedTasks.length;
    const cacheHitRate =
      totalTasks > 0 ? skippedResults.length / totalTasks : undefined;

    const finalResult: AnalysisResult = {
      results: successful,
      parseErrors: [],
      stats: calculateStats(successful, startTime, cacheHitRate),
    };

    if (
      options.cache &&
      plan.globalHash &&
      finalResult.results.length <= MAX_FULL_ANALYSIS_CACHE_RESULTS
    ) {
      debug('engine', 'Caching full analysis result for global hash...');

      if (options.debug) {
        debug(
          'engine',
          `Analysis Results: ${finalResult.results.length} items`
        );
        if (finalResult.results.length > 0) {
          debug(
            'engine',
            `Sample item keys: ${Object.keys(finalResult.results[0]).join(', ')}`
          );
        }
      }

      try {
        await options.cache.analysis.set(plan.globalHash, finalResult);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        debug('engine', `Failed to cache analysis result: ${msg}`);
        options.errorCollector?.record(
          createInfrastructureError('IOError', {
            cause: `Failed to write analysis cache: ${msg}`,
            phase: 'engine',
            recoverable: true,
          })
        );
      }
    } else if (options.cache && plan.globalHash) {
      debug(
        'engine',
        `Skipping full analysis cache: ${finalResult.results.length} results exceeds ${MAX_FULL_ANALYSIS_CACHE_RESULTS} result safety limit`
      );
    }

    return Ok(finalResult);
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)));
  }
};

const executeTasksLocally = async (
  tasks: ReadonlyArray<Task>,
  rootDir: string,
  concurrency: number,
  useTypeAwareContext: boolean,
  errorCollector?: InfrastructureErrorCollector,

  files?: ReadonlyArray<string>,
  parserOptions?: ParserOptions,
  buildProjectContext = true,
  programRootFiles?: ReadonlyArray<string>,
  onDelta?: (delta: number) => void,
  onFileProgress?: (event: AnalysisFileProgress) => void
): Promise<RuleResult[]> => {
  const context = useTypeAwareContext
    ? createTypeAwareAnalysisContext(rootDir, files ?? [], parserOptions, {
        buildProjectContext,
        programRootFiles,
      })
    : createAnalysisContext(rootDir);

  if (useTypeAwareContext) {
    await (
      context as ReturnType<typeof createTypeAwareAnalysisContext>
    ).warmup();
    debug(
      'engine',
      `Phase 1 complete — TypeScript Program ready. Starting Phase 2: ${concurrency} concurrent file batches.`
    );
  }

  const tasksByFile = groupTasksByFile(tasks);

  debug(
    'engine',
    `Grouped ${tasks.length} tasks into ${tasksByFile.size} file batches`
  );

  const limit = pLimit(concurrency);
  const results = await Promise.all(
    Array.from(tasksByFile.values()).map((fileTasks) =>
      limit(async () => {
        const filePath = fileTasks[0]?.filePath;
        const fileStart = performance.now();
        try {
          const batchResults = await executeBatchedTasks(fileTasks, context);
          context.evict(filePath);
          onDelta?.(fileTasks.length);
          if (filePath) {
            onFileProgress?.(
              buildFileProgress(
                filePath,
                fileTasks.length,
                batchResults,
                performance.now() - fileStart,
                useTypeAwareContext
              )
            );
          }
          return batchResults;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          context.evict(filePath);
          onDelta?.(fileTasks.length);
          if (filePath) {
            onFileProgress?.(
              buildFileProgress(
                filePath,
                fileTasks.length,
                [],
                performance.now() - fileStart,
                useTypeAwareContext
              )
            );
          }
          errorCollector?.record(
            createInfrastructureError('IOError', {
              filePath,
              cause: `Batch execution failed: ${msg}`,
              phase: 'engine',
              recoverable: true,
            })
          );
          return [];
        }
      })
    )
  );

  context.dispose();
  return results
    .flat()
    .filter((r: RuleResult | null): r is RuleResult => r !== null);
};

const executeTypeAwareTasks = async (
  tasks: ReadonlyArray<Task>,
  rootDir: string,
  concurrency: number,
  fileConcurrency: number,
  chunkSize: number,
  options: AnalysisOptions,
  onDelta?: (delta: number) => void,
  onFileProgress?: (event: AnalysisFileProgress) => void
): Promise<RuleResult[]> => {
  const tasksByFile = groupTasksByFile(tasks);
  const fileEntries = await buildTypeAwareFileEntries(
    tasksByFile,
    rootDir,
    options.typeAwareChunkStrategy ?? 'dependency'
  );

  const isolationMode = options.typeAwareIsolation ?? 'auto';
  const useProcessIsolation =
    isolationMode === 'process' ||
    (isolationMode === 'auto' &&
      fileEntries.length >= ISOLATED_TYPE_AWARE_FILE_COUNT);
  const adaptiveChunkCap = getAdaptiveTypeAwareChunkCap();
  debug(
    'engine',
    `Type-aware: ${tasks.length} tasks across ${fileEntries.length} files; requested chunk size ${chunkSize}; adaptive cap ${adaptiveChunkCap}; chunk concurrency=${concurrency}; file concurrency=${fileConcurrency}; isolation=${useProcessIsolation ? 'process' : 'in-process'}`
  );

  const allResults: RuleResult[] = [];
  const limit = pLimit(concurrency);

  const projectFiles =
    options.files && options.files.length > 0 ? options.files : undefined;

  for (const wave of buildTypeAwareChunkWaves(
    fileEntries,
    chunkSize,
    adaptiveChunkCap,
    concurrency
  )) {
    const waveResults = await Promise.all(
      wave.map((chunk) =>
        limit(async () => {
          debug(
            'engine',
            `Type-aware chunk ${chunk.index}: ${chunk.files.length} files, ${chunk.programRootFiles.length} TS roots, ${chunk.tasks.length} tasks`
          );
          const filesForContext = projectFiles ?? chunk.files;
          const results = useProcessIsolation
            ? await executeTypeAwareChunkInChildProcess(
                chunk.tasks,
                rootDir,
                filesForContext,
                chunk.programRootFiles,
                chunk.buildProjectContext,
                fileConcurrency,
                options,
                onFileProgress
              )
            : await executeTasksLocally(
                chunk.tasks,
                rootDir,
                fileConcurrency,
                true,
                options.errorCollector,
                filesForContext,
                options.parserOptions,
                chunk.buildProjectContext,
                chunk.programRootFiles,
                onDelta,
                onFileProgress
              );

          if (useProcessIsolation) {
            onDelta?.(chunk.tasks.length);
          }
          return results;
        })
      )
    );

    allResults.push(...waveResults.flat());
    runGarbageCollectionHint();
  }

  return allResults;
};

const runGarbageCollectionHint = (): void => {
  const maybeGc = (globalThis as { gc?: () => void }).gc;
  if (typeof maybeGc === 'function') {
    maybeGc();
  }
};

const getTypeAwareConcurrency = (
  requested: number | undefined,
  maxWorkers: number
): number => {
  const parsed =
    requested == null || Number.isNaN(requested)
      ? DEFAULT_TYPE_AWARE_CONCURRENCY
      : Math.floor(requested);
  return Math.max(
    1,
    Math.min(parsed, maxWorkers, ABSOLUTE_MAX_TYPE_AWARE_CONCURRENCY)
  );
};

const getTypeAwareFileConcurrency = (
  requested: number | undefined,
  maxWorkers: number
): number => {
  const parsed =
    requested == null || Number.isNaN(requested)
      ? DEFAULT_TYPE_AWARE_FILE_CONCURRENCY
      : Math.floor(requested);
  return Math.max(
    1,
    Math.min(parsed, maxWorkers, ABSOLUTE_MAX_TYPE_AWARE_FILE_CONCURRENCY)
  );
};

const buildTypeAwareChunkWaves = (
  fileEntries: ReadonlyArray<[string, Task[]]>,
  requestedChunkSize: number,
  adaptiveChunkCap: number,
  concurrency: number
): TypeAwareChunkWork[][] => {
  const waves: TypeAwareChunkWork[][] = [];
  let currentChunkSize = normalizeChunkSize(
    requestedChunkSize,
    adaptiveChunkCap
  );
  let lowHeapStreak = 0;
  let chunkIndex = 1;

  for (let offset = 0; offset < fileEntries.length; ) {
    const wave: TypeAwareChunkWork[] = [];

    for (
      let slot = 0;
      slot < concurrency && offset < fileEntries.length;
      slot++
    ) {
      const chunk = fileEntries.slice(offset, offset + currentChunkSize);
      const chunkTasks = chunk.flatMap(([, t]) => t);
      const programRootFiles = getTypeScriptRootFiles(chunkTasks);

      if (programRootFiles.length > 0) {
        wave.push({
          index: chunkIndex,
          tasks: chunkTasks,
          files: chunk.map(([f]) => f),
          programRootFiles,
          buildProjectContext: chunkTasks.some((t) => !!t.needsProjectContext),
        });
      } else {
        debug(
          'engine',
          `Skipping type-aware chunk ${chunkIndex} with no TypeScript roots (${chunkTasks.length} tasks)`
        );
      }

      chunkIndex++;
      offset += chunk.length;
    }

    if (wave.length > 0) {
      waves.push(wave);
    }

    const next = getNextAdaptiveChunkSize(
      currentChunkSize,
      lowHeapStreak,
      adaptiveChunkCap
    );
    currentChunkSize = next.chunkSize;
    lowHeapStreak = next.lowHeapStreak;
  }

  return waves;
};

const normalizeChunkSize = (size: number, maxChunkSize: number): number => {
  if (!Number.isFinite(size)) return maxChunkSize;
  return Math.max(
    MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE,
    Math.min(maxChunkSize, Math.floor(size))
  );
};

const getAdaptiveTypeAwareChunkCap = (): number => {
  const totalGb = os.totalmem() / 1024 ** 3;
  const freeGb = os.freemem() / 1024 ** 3;
  const heapLimitGb = v8.getHeapStatistics().heap_size_limit / 1024 ** 3;
  const cpuCount = os.cpus().length;

  let cap: number;
  if (freeGb < 1.5 || totalGb < 4) {
    cap = 100;
  } else if (freeGb < 3 || totalGb < 8) {
    cap = 300;
  } else if (freeGb < 6 || totalGb < 16) {
    cap = 650;
  } else if (freeGb < 12 || totalGb < 32) {
    cap = 1000;
  } else {
    cap = 1500;
  }

  if (cpuCount <= 4) cap = Math.min(cap, 500);
  else if (cpuCount >= 12)
    cap = Math.min(
      ABSOLUTE_MAX_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE,
      Math.round(cap * 1.2)
    );

  if (heapLimitGb < 2) cap = Math.min(cap, 250);
  else if (heapLimitGb < 4) cap = Math.min(cap, 650);

  cap = Math.max(
    MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE,
    Math.min(ABSOLUTE_MAX_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE, cap)
  );
  debug(
    'engine',
    `Adaptive type-aware chunk cap: ${cap} files ` +
      `(free memory ${freeGb.toFixed(1)}GB, total memory ${totalGb.toFixed(1)}GB, V8 heap limit ${heapLimitGb.toFixed(1)}GB, CPUs ${cpuCount})`
  );
  return cap;
};

const getNextAdaptiveChunkSize = (
  current: number,
  lowHeapStreak: number,
  maxChunkSize: number
): { chunkSize: number; lowHeapStreak: number } => {
  const usage = process.memoryUsage();
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  const pressure = heapLimit > 0 ? usage.heapUsed / heapLimit : 0;

  if (
    pressure >= CRITICAL_HEAP_PRESSURE_RATIO &&
    current > MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE
  ) {
    const next = Math.max(
      MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE,
      Math.floor(current / 2)
    );
    debug(
      'engine',
      `Critical heap pressure after type-aware chunk (${Math.round(pressure * 100)}% of V8 heap limit); reducing chunk size to ${next}`
    );
    return { chunkSize: next, lowHeapStreak: 0 };
  }

  if (
    pressure >= HIGH_HEAP_PRESSURE_RATIO &&
    current > MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE
  ) {
    const next = Math.max(
      MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE,
      Math.floor(current * 0.8)
    );
    debug(
      'engine',
      `High heap pressure after type-aware chunk (${Math.round(pressure * 100)}% of V8 heap limit); reducing chunk size to ${next}`
    );
    return { chunkSize: next, lowHeapStreak: 0 };
  }

  if (pressure <= LOW_HEAP_PRESSURE_RATIO && current < maxChunkSize) {
    const nextLowHeapStreak = lowHeapStreak + 1;
    if (nextLowHeapStreak < ADAPTIVE_GROWTH_STREAK) {
      return { chunkSize: current, lowHeapStreak: nextLowHeapStreak };
    }

    const next = Math.min(
      maxChunkSize,
      current + Math.max(10, Math.floor(current * 0.1))
    );
    debug(
      'engine',
      `Sustained low heap pressure after type-aware chunk (${Math.round(pressure * 100)}% of V8 heap limit); increasing chunk size to ${next}`
    );
    return { chunkSize: next, lowHeapStreak: 0 };
  }

  return { chunkSize: current, lowHeapStreak: 0 };
};

const getTypeScriptRootFiles = (tasks: ReadonlyArray<Task>): string[] => {
  const roots = new Set<string>();
  for (const task of tasks) {
    const tsPath = task.inputs.typescript.path;
    if (isTsProgramRoot(tsPath)) roots.add(tsPath);
  }
  return [...roots];
};

type TypeAwareChunkStrategy = NonNullable<
  AnalysisOptions['typeAwareChunkStrategy']
>;

const buildTypeAwareFileEntries = async (
  tasksByFile: ReadonlyMap<string, Task[]>,
  rootDir: string,
  strategy: TypeAwareChunkStrategy
): Promise<Array<[string, Task[]]>> => {
  const entries = Array.from(tasksByFile.entries());
  if (strategy === 'simple') {
    debug(
      'engine',
      `Type-aware chunk ordering: simple path sort for ${entries.length} files`
    );
    return sortFileEntries(entries);
  }

  debug(
    'engine',
    `Type-aware chunk ordering: dependency pre-pass for ${entries.length} files`
  );
  const start = performance.now();
  const dependencyEntries = await buildDependencyAwareFileEntries(
    entries,
    rootDir,
    start + DEPENDENCY_GROUPING_TIMEOUT_MS
  );

  if (!dependencyEntries) {
    debug(
      'engine',
      `Dependency chunk ordering exceeded ${DEPENDENCY_GROUPING_TIMEOUT_MS}ms; falling back to simple path sort`
    );
    return sortFileEntries(entries);
  }

  debug(
    'engine',
    `Dependency chunk ordering complete in ${(performance.now() - start).toFixed(1)}ms`
  );
  return dependencyEntries;
};

const buildDependencyAwareFileEntries = async (
  entries: ReadonlyArray<[string, Task[]]>,
  rootDir: string,
  deadlineMs: number
): Promise<Array<[string, Task[]]> | null> => {
  const groups = new Map<string, Array<[string, Task[]]>>();
  const limit = pLimit(DEPENDENCY_GROUPING_CONCURRENCY);

  for (let i = 0; i < entries.length; i += DEPENDENCY_GROUPING_CONCURRENCY) {
    if (performance.now() > deadlineMs) return null;
    const batch = entries.slice(i, i + DEPENDENCY_GROUPING_CONCURRENCY);
    await Promise.all(
      batch.map((entry) =>
        limit(async () => {
          const [filePath, tasks] = entry;
          const rootFile = getTypeScriptRootFiles(tasks)[0] ?? filePath;
          const key = await getDependencyGroupKey(rootFile, rootDir);
          const group = groups.get(key) ?? [];
          group.push(entry);
          groups.set(key, group);
        })
      )
    );
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, group]) => sortFileEntries(group));
};

const sortFileEntries = (
  entries: ReadonlyArray<[string, Task[]]>
): Array<[string, Task[]]> => {
  return [...entries].sort(([a], [b]) => a.localeCompare(b));
};

const getDependencyGroupKey = async (
  filePath: string,
  rootDir: string
): Promise<string> => {
  const dir = dirname(filePath);
  try {
    const source = await readFile(filePath, 'utf8');
    const firstLocalImport = findFirstLocalImport(source);
    if (!firstLocalImport) return dir;
    return join(dir, firstLocalImport.split('/')[0] ?? '');
  } catch {
    return dirname(join(rootDir, filePath));
  }
};

const findFirstLocalImport = (source: string): string | null => {
  const importRe = /\b(?:import|export)\b[^'"]*['"](\.{1,2}\/[^'"]+)['"]/g;
  const match = importRe.exec(source);
  return match?.[1] ?? null;
};

const executeTypeAwareChunkInChildProcess = async (
  tasks: ReadonlyArray<Task>,
  rootDir: string,
  files: ReadonlyArray<string>,
  programRootFiles: ReadonlyArray<string>,
  buildProjectContext: boolean,
  fileConcurrency: number,
  options: AnalysisOptions,
  onFileProgress?: (event: AnalysisFileProgress) => void
): Promise<RuleResult[]> => {
  const workerPath = await resolveTypeAwareWorkerPath();
  if (!workerPath) {
    debug(
      'engine',
      'Type-aware child worker not found; falling back to in-process execution'
    );
    return executeTasksLocally(
      tasks,
      rootDir,
      fileConcurrency,
      true,
      options.errorCollector,
      files,
      options.parserOptions,
      buildProjectContext,
      programRootFiles,
      undefined,
      onFileProgress
    );
  }

  return new Promise<RuleResult[]>((resolve, reject) => {
    const child = fork(workerPath, [], {
      cwd: rootDir,
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new Error(
          `Type-aware child process timed out after ${TYPE_AWARE_CHILD_TIMEOUT_MS / 1000}s`
        )
      );
    }, TYPE_AWARE_CHILD_TIMEOUT_MS);

    child.stdout?.on('data', (data) =>
      debug('engine', `[type-aware-child] ${String(data).trim()}`)
    );
    child.stderr?.on('data', (data) =>
      debug('engine', `[type-aware-child:stderr] ${String(data).trim()}`)
    );

    child.on('message', (message: unknown) => {
      if (isAnalysisFileProgress(message)) {
        onFileProgress?.(message);
        return;
      }

      if (isTypeAwareChildComplete(message)) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(message.results);
        return;
      }

      if (isTypeAwareChildError(message)) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(message.error));
      }
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Type-aware child process exited before completion with code ${code}`
        )
      );
    });

    child.send({
      rootDir,
      tasks,
      files,
      programRootFiles,
      parserOptions: options.parserOptions,
      buildProjectContext,
      fileConcurrency,
    });
  });
};

const resolveTypeAwareWorkerPath = async (): Promise<string | null> => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  try {
    const req = createRequire(import.meta.url);
    const workerFromRules = req.resolve('@ngcompass/rules/type-aware-worker');
    if (existsSync(workerFromRules)) return workerFromRules;
  } catch {}

  const candidates = [
    join(__dirname, '..', '..', 'rules', 'dist', 'type-aware-worker.js'),
    join(__dirname, '..', '..', 'rules', 'dist', 'type-aware-worker.cjs'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
};

const isTypeAwareChildComplete = (
  message: unknown
): message is { kind: 'complete'; results: RuleResult[] } => {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as { kind?: unknown }).kind === 'complete' &&
    Array.isArray((message as { results?: unknown }).results)
  );
};

const isTypeAwareChildError = (
  message: unknown
): message is { kind: 'error'; error: string } => {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as { kind?: unknown }).kind === 'error' &&
    typeof (message as { error?: unknown }).error === 'string'
  );
};

const retrieveSkippedResults = async (
  skippedTasks: ReadonlyArray<Task>,
  cachedResults: ReadonlyMap<string, unknown> | undefined,
  cache?: CacheContext
): Promise<RuleResult[]> => {
  if (skippedTasks.length === 0) return [];

  debug(
    'engine',
    `Retrieving results for ${skippedTasks.length} skipped tasks...`
  );

  const skippedResults: RuleResult[] = [];
  const tasksToFetch: Task[] = [];

  if (cachedResults) {
    for (const task of skippedTasks) {
      const result = cachedResults.get(task.taskId);
      if (result && isRuleResult(result)) {
        skippedResults.push(result);
      } else {
        tasksToFetch.push(task);
      }
    }
  } else {
    tasksToFetch.push(...skippedTasks);
  }

  if (tasksToFetch.length > 0 && cache) {
    debug(
      'engine',
      `Fetching ${tasksToFetch.length} results from cache service...`
    );
    const taskIds = tasksToFetch.map((t) => t.taskId);
    const cachedEntries = await cache.results.getMany(taskIds);

    for (const task of tasksToFetch) {
      const entry = cachedEntries.get(task.taskId);
      if (entry && isRuleResult(entry)) {
        skippedResults.push(entry);
      }
    }
  }

  debug('engine', `Retrieved ${skippedResults.length} results from cache`);
  return skippedResults;
};
