import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initHasher } from '@ngcompass/cache';
import {
  AnalysisResult,
  createInfrastructureError,
  debug,
  Err,
  InfrastructureErrorCollector,
  Ok,
  time,
  timeLog,
  type ConfigOverride,
  type ResolvedRule,
  type Result,
} from '@ngcompass/common';

import { ComponentDependencyGraph } from '../resource-discovery/component-graph.js';
import { ANGULAR_DECORATOR_RE, detectFileType } from '../file-type.js';
import {
  calculateFileHash,
  calculateGlobalHash,
  warmupHashCache,
} from '../task-identity/hashing.js';
import { filterCachedTasks } from '../incremental-analysis/incremental.js';
import { buildIndexes } from '../incremental-analysis/indexes.js';
import { resolveOverridesForFile } from '../incremental-analysis/overrides.js';
import {
  deserializePlan,
  PLAN_SCHEMA_VERSION,
  serializePlan,
} from '../task-identity/serialize.js';
import { buildTasksForFileTaskCentric } from './task-builder.js';
import type {
  ExecutionPlanOptions,
  ExecutionPlanOutput,
  FileAnalysisUnit,
  FileType,
  RuleTask,
  Task,
  TaskBuilderContext,
} from '../models/index.js';
import { groupTasksByFile } from '../task-identity/utils.js';

const DEFAULT_PARALLEL_THRESHOLD = 10_000;
const DEFAULT_WORKER_COUNT = 4;
const PRECLASSIFY_BATCH_SIZE = 256;

export const buildExecutionPlan = async (
  options: ExecutionPlanOptions
): Promise<Result<ExecutionPlanOutput>> => {
  const timerLabel = 'buildExecutionPlan';
  time(timerLabel);

  try {
    await initHasher();

    const { files, rules } = options;
    debug(
      'planner',
      `Building execution plan for ${files.length} files and ${rules.size} rules`
    );

    const validationError = validateBuildInputs(files, rules);
    if (validationError) return Err(validationError);

    const context = createTaskBuilderContext(options);
    const fileTypeCache = new Map<string, FileType>();
    const errorCollector = new InfrastructureErrorCollector();

    await warmHashCacheIfPossible(options, context);

    const cachedPlan = await tryLoadPlanFromCache(
      options,
      context,
      errorCollector
    );

    if (!cachedPlan) {
      await prepareComponentGraph(options, context);
    }

    if (cachedPlan && cachedPlan.precomputedAnalysis) {
      timeLog(
        timerLabel,
        'planner',
        'Full analysis cached — returning precomputed result'
      );
      return Ok(cachedPlan);
    }

    const allTasks = cachedPlan
      ? (timeLog(timerLabel, 'planner', 'Execution plan loaded from cache'),
        cachedPlan.tasks)
      : await buildAndPersistTasks(options, context, fileTypeCache);

    const { tasks, skippedTasks, cachedResults, changedFiles, cachedFiles } =
      await splitTasksAgainstCache(options, allTasks);

    debug('planner', 'Converting tasks to file-centric plan...');
    const plan = convertTasksToPlan(tasks, rules, fileTypeCache);

    debug('planner', `Building indexes for ${tasks.length} tasks...`);
    const indexes = buildIndexes(plan, tasks);

    timeLog(timerLabel, 'planner', 'Execution plan built');
    return Ok({
      tasks,
      plan,
      indexes,
      skippedTasks,
      cachedResults,
      globalHash: context.globalHash,
      changedFiles,
      cachedFiles,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    debug('planner', `Error building plan: ${err.message}`);
    return Err(
      new Error(`Failed to build execution plan: ${err.message}`, {
        cause: err,
      })
    );
  }
};

export const getExecutionPlanSummary = (
  output: ExecutionPlanOutput
): string => {
  const { stats } = output.indexes;
  return [
    '--- Execution Plan Summary ---',
    `Total files: ${stats.totalFiles}`,
    `Total tasks: ${stats.totalTasks}`,
    `Avg tasks per file: ${stats.avgTasksPerFile.toFixed(1)}`,
    `Files with templates: ${stats.filesWithTemplates}`,
    `Files with styles: ${stats.filesWithStyles}`,
    `Files with specs: ${stats.filesWithSpecs}`,
    '',
  ].join('\n');
};

const validateBuildInputs = (
  files: ReadonlyArray<string>,
  rules: ReadonlyMap<string, ResolvedRule>
): Error | null => {
  if (files.length === 0) return new Error('No files to analyze');
  if (rules.size === 0) return new Error('No rules configured');
  return null;
};

const createTaskBuilderContext = (
  options?: Pick<ExecutionPlanOptions, 'cacheKeyCtx'>
): TaskBuilderContext => ({
  hashCache: new Map(),
  resourceCache: new Map(),
  directoryCache: new Map(),
  cacheKeyCtx: options?.cacheKeyCtx,
});

const warmHashCacheIfPossible = async (
  options: ExecutionPlanOptions,
  context: TaskBuilderContext
): Promise<void> => {
  if (!options.cache) return;
  debug('planner', 'Warming up hash cache from metadata index...');
  const start = performance.now();
  await warmupHashCache(
    options.files,
    options.cache.metas,
    context.hashCache!
  );
  debug(
    'planner',
    `Metadata warmup took ${(performance.now() - start).toFixed(2)}ms`
  );
};

const prepareComponentGraph = async (
  options: ExecutionPlanOptions,
  context: TaskBuilderContext
): Promise<void> => {
  const graph = new ComponentDependencyGraph();
  await graph.build(options.files);
  context.componentGraph = graph;
  context.graphStats = { hits: 0, misses: 0, fallbacks: 0 };
  debug('planner', 'Component dependency graph built');
};

const tryLoadPlanFromCache = async (
  options: ExecutionPlanOptions,
  context: TaskBuilderContext,
  errorCollector?: InfrastructureErrorCollector
): Promise<ExecutionPlanOutput | null> => {
  if (!options.cache) return null;

  const { files, rules } = options;
  const globalHash = await calculateGlobalHash(
    files,
    rules,
    context.hashCache!,
    options.cacheKeyCtx
  );
  context.globalHash = globalHash;

  if (options.incremental?.forceRerun) return null;

  const precomputedAnalysis =
    await options.cache.analysis.get<AnalysisResult>(globalHash);
  if (precomputedAnalysis) {
    if (options.debug)
      debug('planner', 'Analysis results cached (Short-circuit enabled)');
    return buildPrecomputedOutput(globalHash, precomputedAnalysis);
  }

  const tIOStart = performance.now();
  const cachedData = await options.cache.plans.get(globalHash);
  const tIOEnd = performance.now();
  if (!cachedData) return null;

  const tDeserStart = performance.now();
  let output: ExecutionPlanOutput;
  try {
    const versioned = cachedData as { v?: number };
    output =
      versioned.v === PLAN_SCHEMA_VERSION
        ? deserializePlan(cachedData as Parameters<typeof deserializePlan>[0])
        : (cachedData as ExecutionPlanOutput);
  } catch (deserErr) {
    debug(
      'planner',
      'Plan cache deserialization failed — deleting corrupted entry and rebuilding'
    );
    try {
      await options.cache.plans.delete?.(globalHash);
    } catch (deleteErr) {
      debug(
        'planner',
        `Could not delete corrupted plan entry: ${deleteErr instanceof Error ? deleteErr.message : String(deleteErr)}`
      );
    }
    if (errorCollector) {
      errorCollector.record(
        createInfrastructureError('CacheCorruption', {
          cause:
            deserErr instanceof Error ? deserErr.message : String(deserErr),
          phase: 'planner',
          recoverable: true,
          details: { globalHash },
        })
      );
    }
    return null;
  }
  const tDeserEnd = performance.now();

  if (options.debug) {
    debug('planner', 'Plan cache HIT');
    debug('planner', `  IO:    ${(tIOEnd - tIOStart).toFixed(2)}ms`);
    debug('planner', `  Deser: ${(tDeserEnd - tDeserStart).toFixed(2)}ms`);
  }

  return { ...output, globalHash };
};

const buildPrecomputedOutput = (
  globalHash: string,
  precomputedAnalysis: AnalysisResult
): ExecutionPlanOutput => ({
  tasks: [],
  plan: {},
  indexes: emptyIndexes(),
  skippedTasks: [],
  globalHash,
  precomputedAnalysis,
});

const emptyIndexes = (): ExecutionPlanOutput['indexes'] => ({
  filesNeedingTsAst: [],
  filesNeedingHtmlAst: [],
  filesNeedingCssAst: [],
  filesNeedingTypeChecker: [],
  tasksByFile: {},
  tasksByRule: {},
  tasksBySeverityLevel: { off: [], warn: [], error: [] },
  filesByType: {
    component: [],
    directive: [],
    pipe: [],
    service: [],
    module: [],
    guard: [],
    logic: [],
    'angular-class': [],
    spec: [],
    template: [],
    style: [],
    config: [],
    unknown: [],
  },
  tasksBySeverity: { off: 0, warn: 0, error: 0 },
  stats: {
    totalFiles: 0,
    totalTasks: 0,
    avgTasksPerFile: 0,
    filesWithTemplates: 0,
    filesWithStyles: 0,
    filesWithSpecs: 0,
  },
});

const savePlanToCacheIfEnabled = async (
  options: ExecutionPlanOptions,
  context: TaskBuilderContext,
  output: ExecutionPlanOutput
): Promise<void> => {
  if (!options.cache || !context.globalHash) return;

  const start = performance.now();
  debug('planner', 'Saving execution plan to cache...');
  const compact = serializePlan(output);
  await options.cache.plans.set(context.globalHash, compact);
  debug(
    'planner',
    `  Plan cache saved in ${(performance.now() - start).toFixed(2)}ms`
  );
};

const buildAndPersistTasks = async (
  options: ExecutionPlanOptions,
  context: TaskBuilderContext,
  fileTypeCache: Map<string, FileType>
): Promise<ReadonlyArray<Task>> => {
  debug('planner', 'Building tasks...');
  const allTasks = await buildAllTasks(
    options.files,
    options.rules,
    context,
    fileTypeCache,
    options.parallelThreshold,
    options.workerCount,
    options.overrides
  );

  if (options.debug && context.graphStats) {
    const { hits, misses, fallbacks } = context.graphStats;
    debug(
      'planner',
      `Graph stats — hits: ${hits}, misses: ${misses}, fallbacks: ${fallbacks}`
    );
  }

  if (options.cache && context.globalHash) {
    debug('planner', 'Converting all tasks to full plan for cache...');
    const fullPlan = convertTasksToPlan(allTasks, options.rules, fileTypeCache);
    const fullIndexes = buildIndexes(fullPlan, allTasks);
    await savePlanToCacheIfEnabled(options, context, {
      tasks: allTasks,
      plan: fullPlan,
      indexes: fullIndexes,
      skippedTasks: [],
      globalHash: context.globalHash,
    });
  }

  return allTasks;
};

const splitTasksAgainstCache = async (
  options: ExecutionPlanOptions,
  allTasks: ReadonlyArray<Task>
): Promise<{
  tasks: ReadonlyArray<Task>;
  skippedTasks: ReadonlyArray<Task>;
  cachedResults?: ReadonlyMap<string, unknown>;
  changedFiles?: ReadonlyArray<string>;
  cachedFiles?: ReadonlyArray<string>;
}> => {
  if (!options.cache) {
    return { tasks: allTasks, skippedTasks: [] };
  }

  debug('planner', 'Filtering cached tasks...');
  const incremental = await filterCachedTasks(
    allTasks,
    options.cache.results,
    options.incremental
  );

  const changedFiles = [...new Set(incremental.tasks.map((t) => t.filePath))];
  const cachedFiles = [
    ...new Set(incremental.skippedTasks.map((t) => t.filePath)),
  ].filter((f) => !changedFiles.includes(f));

  return {
    tasks: incremental.tasks,
    skippedTasks: incremental.skippedTasks,
    cachedResults: incremental.cachedResults,
    changedFiles,
    cachedFiles,
  };
};

const buildAllTasks = async (
  files: ReadonlyArray<string>,
  rules: ReadonlyMap<string, ResolvedRule>,
  context?: TaskBuilderContext,
  fileTypeCache?: Map<string, FileType>,
  parallelThreshold = DEFAULT_PARALLEL_THRESHOLD,
  workerCount = DEFAULT_WORKER_COUNT,
  overrides?: ReadonlyArray<ConfigOverride>
): Promise<ReadonlyArray<Task>> => {
  await preclassifyLogicFiles(files, fileTypeCache);

  if (files.length >= parallelThreshold) {
    const tasks = await tryBuildAllTasksParallel(
      files,
      rules,
      fileTypeCache,
      workerCount,
      overrides
    );
    if (tasks) return tasks;
  }

  return buildAllTasksSequential(
    files,
    rules,
    context,
    fileTypeCache,
    overrides
  );
};

const preclassifyLogicFiles = async (
  files: ReadonlyArray<string>,
  fileTypeCache?: Map<string, FileType>
): Promise<void> => {
  if (!fileTypeCache) return;

  const candidates = files.filter((f) => {
    if (fileTypeCache.has(f)) return false;
    return detectFileType(f) === 'logic';
  });
  if (candidates.length === 0) return;

  debug(
    'planner',
    `Level-2 classification: scanning ${candidates.length} unclassified .ts files for Angular decorators`
  );
  const start = performance.now();

  for (let i = 0; i < candidates.length; i += PRECLASSIFY_BATCH_SIZE) {
    const batch = candidates.slice(i, i + PRECLASSIFY_BATCH_SIZE);
    await Promise.all(
      batch.map(async (filePath) => {
        try {
          const content = await readFile(filePath, 'utf8');
          fileTypeCache.set(
            filePath,
            ANGULAR_DECORATOR_RE.test(content) ? 'angular-class' : 'logic'
          );
        } catch {
          fileTypeCache.set(filePath, 'logic');
        }
      })
    );
  }

  const upgraded = [...fileTypeCache.values()].filter(
    (v) => v === 'angular-class'
  ).length;
  debug(
    'planner',
    `Level-2 classification complete in ${(performance.now() - start).toFixed(1)}ms — upgraded ${upgraded} files to 'angular-class'`
  );
};

const buildAllTasksSequential = async (
  files: ReadonlyArray<string>,
  rules: ReadonlyMap<string, ResolvedRule>,
  context?: TaskBuilderContext,
  fileTypeCache?: Map<string, FileType>,
  overrides?: ReadonlyArray<ConfigOverride>
): Promise<Task[]> => {
  const allTasks: Task[] = [];
  for (const file of files) {
    const fileType = getOrDetectFileType(file, fileTypeCache);
    const fileRules = overrides?.length
      ? resolveOverridesForFile(file, rules, overrides)
      : rules;
    const fileTasks = await buildTasksForFileTaskCentric(
      file,
      fileType,
      fileRules,
      context
    );
    allTasks.push(...fileTasks);
  }
  return allTasks;
};

const tryBuildAllTasksParallel = async (
  files: ReadonlyArray<string>,
  rules: ReadonlyMap<string, ResolvedRule>,
  fileTypeCache: Map<string, FileType> | undefined,
  workerCount: number,
  overrides?: ReadonlyArray<ConfigOverride>
): Promise<Task[] | null> => {
  debug(
    'planner',
    `Parallelizing task discovery across ${workerCount} workers...`
  );

  try {
    const workerPath = resolveWorkerPath();
    if (!workerPath) {
      debug(
        'planner',
        'Worker script not found, falling back to sequential execution'
      );
      return null;
    }
    debug('planner', `Using worker: ${workerPath}`);

    const chunks = splitIntoChunks(files, workerCount);
    debug(
      'planner',
      `Split ${files.length} files into ${chunks.length} chunks`
    );

    const tasks = await runWorkerChunks(
      chunks,
      workerPath,
      rules,
      fileTypeCache,
      overrides
    );
    debug('planner', `Workers completed. Generated ${tasks.length} tasks.`);
    return tasks;
  } catch (error) {
    debug(
      'planner',
      `Parallel execution failed, falling back to sequential: ${String(error)}`
    );
    return null;
  }
};

const resolveWorkerPath = (): string | null => {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'worker.js'),
    join(here, 'worker.cjs'),
    join(here, 'planner', 'worker.js'),
    join(here, 'planner', 'worker.cjs'),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
};

const splitIntoChunks = (
  items: ReadonlyArray<string>,
  chunkCount: number
): string[][] => {
  const size = Math.max(1, Math.ceil(items.length / chunkCount));
  const chunks: string[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const runWorkerChunks = async (
  chunks: ReadonlyArray<string[]>,
  workerPath: string,
  rules: ReadonlyMap<string, ResolvedRule>,
  fileTypeCache?: Map<string, FileType>,
  overrides?: ReadonlyArray<ConfigOverride>
): Promise<Task[]> => {
  const { Worker } = await import('node:worker_threads');

  const rulesEntries = Array.from(rules.entries());
  const fileTypeCacheEntries = fileTypeCache
    ? Array.from(fileTypeCache.entries())
    : undefined;
  const overridesData = overrides?.length ? [...overrides] : undefined;

  const workerPromises = chunks.map(
    (chunk, index) =>
      new Promise<Task[]>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: {
            files: chunk,
            rulesEntries,
            fileTypeCacheEntries,
            overridesData,
          },
        });
        worker.on('message', (message: { tasks: Task[] }) =>
          resolve(message.tasks)
        );
        worker.on('error', (err) => {
          debug('planner', `Worker ${index} error: ${String(err)}`);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
        worker.on('exit', (code) => {
          if (code !== 0)
            reject(new Error(`Worker ${index} stopped with exit code ${code}`));
        });
      })
  );

  const results = await Promise.all(workerPromises);
  return results.flat();
};

const getOrDetectFileType = (
  filePath: string,
  cache?: Map<string, FileType>
): FileType => {
  if (!cache) return detectFileType(filePath);
  const cached = cache.get(filePath);
  if (cached) return cached;
  const detected = detectFileType(filePath);
  cache.set(filePath, detected);
  return detected;
};

const collectApplicableRulesFromTasks = (
  tasks: ReadonlyArray<Task>,
  rules: ReadonlyMap<string, ResolvedRule>
): ResolvedRule[] => {
  const ruleNamesInFile = new Set(tasks.map((t) => t.ruleName));
  const applicable: ResolvedRule[] = [];
  for (const ruleName of ruleNamesInFile) {
    const rule = rules.get(ruleName);
    if (rule) applicable.push(rule);
  }
  return applicable;
};

const calculateHashFromTasks = (
  tasks: ReadonlyArray<Task>,
  applicableRules: ResolvedRule[]
): string => {
  if (tasks.length === 0) return '';
  return calculateFileHash(tasks[0].inputs, applicableRules);
};

const convertTasksToPlan = (
  tasks: ReadonlyArray<Task>,
  rules: ReadonlyMap<string, ResolvedRule>,
  fileTypeCache?: Map<string, FileType>
): Record<string, FileAnalysisUnit> => {
  const tasksByFile = groupTasksByFile(tasks);
  const plan: Record<string, FileAnalysisUnit> = {};

  for (const [filePath, fileTasks] of tasksByFile) {
    const fileType = getOrDetectFileType(filePath, fileTypeCache);
    const applicableRules = collectApplicableRulesFromTasks(fileTasks, rules);
    const hash = calculateHashFromTasks(fileTasks, applicableRules);

    const ruleTasks: RuleTask[] = fileTasks.map((task) => ({
      ruleName: task.ruleName,
      severity: task.severity,
      options: task.options,
      cacheKey: task.taskId,
      inputs: task.inputs,
      needsTypeChecker: task.needsTypeChecker,
      needsProjectContext: task.needsProjectContext,
    }));

    plan[filePath] = {
      file: { path: filePath, type: fileType, hash },
      tasks: ruleTasks,
    };
  }

  return plan;
};
