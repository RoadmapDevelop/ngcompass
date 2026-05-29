import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
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
import { requestGarbageCollectionUnderPressure } from './runtime-memory.js';
import { runAnalysisParallel } from './worker-pool.js';

const DEFAULT_TYPE_AWARE_FILE_CONCURRENCY = 1;
const ABSOLUTE_MAX_TYPE_AWARE_FILE_CONCURRENCY = 8;
const MAX_FULL_ANALYSIS_CACHE_RESULTS = 20_000;
const PARENT_GC_PRESSURE_RATIO = 0.8;
const PREFLIGHT_ADVISORY_HEAP_GB = 4;
const PREFLIGHT_ADVISORY_FILE_COUNT = 600;
const TYPE_AWARE_CHILD_TIMEOUT_MS = 10 * 60 * 1000;

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

  readonly typeAwareFileConcurrency?: number;

  readonly skipTypeCheck?: boolean;

  readonly onProgress?: (completed: number, total: number) => void;

  readonly onFileProgress?: (event: AnalysisFileProgress) => void;

  readonly onNotice?: (message: string) => void;
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

    if (typeAwareTasks.length > 0 && !options.skipTypeCheck) {
      const preflightFileCount = groupTasksByFile(typeAwareTasks).size;
      emitTypeAwarePreflightNotice(preflightFileCount, options.onNotice);
    }

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
      const typeAwareFileConcurrency = getTypeAwareFileConcurrency(
        options.typeAwareFileConcurrency,
        effectiveMaxWorkers
      );
      const typeAwareResults = await executeTypeAwareTasks(
        typeAwareTasks,
        options.rootDir,
        typeAwareFileConcurrency,
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
  fileConcurrency: number,
  options: AnalysisOptions,
  onDelta?: (delta: number) => void,
  onFileProgress?: (event: AnalysisFileProgress) => void
): Promise<RuleResult[]> => {
  const tasksByFile = groupTasksByFile(tasks);
  const programRootFiles = getTypeScriptRootFiles(tasks);

  if (programRootFiles.length === 0) {
    debug(
      'engine',
      `Type-aware: no TypeScript roots among ${tasksByFile.size} files; nothing to type-check`
    );
    return [];
  }

  const chunk: TypeAwareChunkWork = {
    index: 1,
    tasks,
    files: Array.from(tasksByFile.keys()),
    programRootFiles,
    buildProjectContext: tasks.some((t) => !!t.needsProjectContext),
  };

  const projectFiles =
    options.files && options.files.length > 0 ? options.files : undefined;
  const contextFiles = resolveTypeAwareContextFiles(projectFiles, chunk);

  debug(
    'engine',
    `Type-aware: ${tasks.length} tasks across ${chunk.files.length} files; single ts.Program over ${programRootFiles.length} TS roots; file concurrency=${fileConcurrency}`
  );

  try {
    const results = await executeTypeAwareChunkInChildProcess(
      chunk.tasks,
      rootDir,
      contextFiles,
      chunk.programRootFiles,
      chunk.buildProjectContext,
      fileConcurrency,
      options,
      onFileProgress
    );
    onDelta?.(chunk.tasks.length);
    requestGarbageCollectionUnderPressure(PARENT_GC_PRESSURE_RATIO);
    return results;
  } catch (error) {
    const salvaged =
      error instanceof TypeAwareChildFailure ? [...error.partialResults] : [];
    const completedFiles =
      error instanceof TypeAwareChildFailure
        ? error.completedFiles
        : new Set<string>();
    const remaining = filterChunkToRemainingFiles(chunk, completedFiles);
    if (remaining) reportTypeAwareSkip(remaining, error, options);
    onDelta?.(chunk.tasks.length);
    return salvaged;
  }
};

const resolveTypeAwareContextFiles = (
  projectFiles: ReadonlyArray<string> | undefined,
  chunk: TypeAwareChunkWork
): ReadonlyArray<string> => {
  if (chunk.buildProjectContext && projectFiles) return projectFiles;
  return chunk.files;
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

const getTypeScriptRootFiles = (tasks: ReadonlyArray<Task>): string[] => {
  const roots = new Set<string>();
  for (const task of tasks) {
    const tsPath = task.inputs.typescript.path;
    if (isTsProgramRoot(tsPath)) roots.add(tsPath);
  }
  return [...roots];
};

const buildSubChunk = (
  index: number,
  fileEntries: ReadonlyArray<[string, Task[]]>,
  buildProjectContext: boolean
): TypeAwareChunkWork => {
  const subTasks = fileEntries.flatMap(([, t]) => t);
  return {
    index,
    tasks: subTasks,
    files: fileEntries.map(([f]) => f),
    programRootFiles: getTypeScriptRootFiles(subTasks),
    buildProjectContext,
  };
};

const filterChunkToRemainingFiles = (
  chunk: TypeAwareChunkWork,
  completedFiles: ReadonlySet<string>
): TypeAwareChunkWork | null => {
  if (completedFiles.size === 0) return chunk;
  const remainingEntries = Array.from(
    groupTasksByFile(chunk.tasks).entries()
  ).filter(([filePath]) => !completedFiles.has(filePath));
  if (remainingEntries.length === 0) return null;
  return buildSubChunk(
    chunk.index,
    remainingEntries,
    chunk.buildProjectContext
  );
};

const reportTypeAwareSkip = (
  chunk: TypeAwareChunkWork,
  error: unknown,
  options: AnalysisOptions
): void => {
  const fileCount = new Set(chunk.tasks.map((t) => t.filePath)).size;
  const reason =
    error instanceof TypeAwareChildFailure ? error.reason : 'error';
  const message =
    `Skipped type-aware checks for ${fileCount.toLocaleString()} file(s) after a worker failed (${reason}). ` +
    `Increase memory with NODE_OPTIONS=--max-old-space-size=8192 or run with --skip-type-check to include them.`;
  options.onNotice?.(message);
  options.errorCollector?.record(
    createInfrastructureError('WorkerCrash', {
      cause: message,
      phase: 'engine',
      recoverable: true,
    })
  );
  debug('engine', message);
};

const emitTypeAwarePreflightNotice = (
  typeAwareFileCount: number,
  onNotice: ((message: string) => void) | undefined
): void => {
  if (!onNotice) return;
  const heapLimitGb = v8.getHeapStatistics().heap_size_limit / 1024 ** 3;
  if (heapLimitGb >= PREFLIGHT_ADVISORY_HEAP_GB) return;
  if (typeAwareFileCount < PREFLIGHT_ADVISORY_FILE_COUNT) return;
  const heap = heapLimitGb.toFixed(1);
  const count = typeAwareFileCount.toLocaleString();
  onNotice(
    `Large type-aware workload: ${count} files on a ${heap} GB heap built into a single TypeScript program. ` +
      `If analysis runs out of memory, raise it with NODE_OPTIONS=--max-old-space-size=8192 or run with --skip-type-check.`
  );
};

const HEAP_FLAG_PREFIXES = [
  '--max-old-space-size',
  '--max-semi-space-size',
] as const;

const buildChildExecArgv = (): string[] => {
  const forwarded: string[] = [];
  const source = process.execArgv;
  for (let i = 0; i < source.length; i++) {
    const arg = source[i];
    const matchedPrefix = HEAP_FLAG_PREFIXES.find(
      (prefix) => arg === prefix || arg.startsWith(`${prefix}=`)
    );
    if (!matchedPrefix) continue;
    forwarded.push(arg);
    if (arg === matchedPrefix && i + 1 < source.length) {
      forwarded.push(source[++i]);
    }
  }
  return ['--expose-gc', ...forwarded];
};

type TypeAwareChildFailureReason = 'timeout' | 'crash' | 'spawn' | 'reported';

class TypeAwareChildFailure extends Error {
  readonly reason: TypeAwareChildFailureReason;
  readonly partialResults: ReadonlyArray<RuleResult>;
  readonly completedFiles: ReadonlySet<string>;
  constructor(
    message: string,
    reason: TypeAwareChildFailureReason,
    partialResults: ReadonlyArray<RuleResult>,
    completedFiles: ReadonlySet<string>
  ) {
    super(message);
    this.name = 'TypeAwareChildFailure';
    this.reason = reason;
    this.partialResults = partialResults;
    this.completedFiles = completedFiles;
  }
}

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
      execArgv: buildChildExecArgv(),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let settled = false;
    const streamed: RuleResult[] = [];
    const completedFiles = new Set<string>();
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new TypeAwareChildFailure(
          `Type-aware child process timed out after ${TYPE_AWARE_CHILD_TIMEOUT_MS / 1000}s`,
          'timeout',
          streamed.slice(),
          completedFiles
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

      if (isTypeAwareFileResult(message)) {
        streamed.push(...message.results);
        completedFiles.add(message.filePath);
        return;
      }

      if (isTypeAwareChildComplete(message)) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(streamed);
        return;
      }

      if (isTypeAwareChildError(message)) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(
          new TypeAwareChildFailure(
            message.error,
            'reported',
            streamed.slice(),
            completedFiles
          )
        );
      }
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new TypeAwareChildFailure(
          error.message,
          'spawn',
          streamed.slice(),
          completedFiles
        )
      );
    });

    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new TypeAwareChildFailure(
          `Type-aware child process exited before completion with code ${code}`,
          'crash',
          streamed.slice(),
          completedFiles
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
): message is { kind: 'complete' } => {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as { kind?: unknown }).kind === 'complete'
  );
};

const isTypeAwareFileResult = (
  message: unknown
): message is { kind: 'file-result'; filePath: string; results: RuleResult[] } => {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as { kind?: unknown }).kind === 'file-result' &&
    typeof (message as { filePath?: unknown }).filePath === 'string' &&
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
