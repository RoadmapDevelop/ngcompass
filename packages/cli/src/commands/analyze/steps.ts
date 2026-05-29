import process from 'node:process';
import {
  DEFAULT_INCLUDE_PATTERNS,
  type AnalysisResult,
  type NormalizedAnalyzerConfig,
  type ResolvedRulesMap,
  type RuleResult,
} from '@ngcompass/common';
import type { Reporter } from '@ngcompass/reporters';
import { CacheContext } from '@ngcompass/cache';
import { loadPlugins, resolveConfig } from '@ngcompass/config';
import {
  configureRuleExecutor,
  runAnalysis,
  type AnalysisFileProgress,
} from '@ngcompass/engine';
import {
  buildExecutionPlan,
  type ExecutionPlanOutput,
} from '@ngcompass/planner';
import { scan } from '@ngcompass/scanner';
import {
  executeBatchedNewEngineRules,
  getEnabledRules,
  getGlobalRegistry,
  isNewEngineRule,
  resolveRules,
} from '@ngcompass/rules';
import type { AnalyzeOptions, EffectivePerformanceOptions } from './options.js';
import { resolveParserProjectPath } from './resolve.js';

export async function loadConfigurationStep(
  options: AnalyzeOptions,
  cache: CacheContext,
  reporter: Reporter
): Promise<{ config: NormalizedAnalyzerConfig } | null> {
  const tStart = performance.now();
  reporter.step('❯ Loading configuration...');

  const configResult = await resolveConfig({
    profile: options.profile,
    cache,
    cwd: process.cwd(),
  });

  if (!configResult.report.valid) {
    const issueLines = configResult.report.issues.map((issue) => {
      const pathString = issue.path?.join('.') || 'root';
      return `[${issue.severity.toUpperCase()}] ${pathString}: ${issue.message}`;
    });
    reporter.error(
      new Error(['Configuration validation failed', ...issueLines].join('\n'))
    );
    return null;
  }

  if (!configResult.config) {
    reporter.error(new Error('No configuration found'));
    return null;
  }

  const pluginList = configResult.config.plugins;
  if (pluginList && pluginList.length > 0) {
    reporter.step(`❯ Loading ${pluginList.length} plugin(s)...`);
    const configDir = process.cwd();
    await loadPlugins(pluginList, configDir, getGlobalRegistry());
    reporter.info(`Loaded ${pluginList.length} plugin(s)`);
  }

  reporter.debug(
    `Config resolve: ${(performance.now() - tStart).toFixed(2)}ms`
  );
  return { config: configResult.config };
}

export async function discoverFilesStep(
  config: NormalizedAnalyzerConfig,
  options: AnalyzeOptions,
  cache: CacheContext | undefined,
  reporter: Reporter
): Promise<ReadonlyArray<string> | null> {
  const tStart = performance.now();
  reporter.step('❯ Discovering files...');

  const scanResult = await scan({
    rootDir: process.cwd(),
    include: config.include ?? [...DEFAULT_INCLUDE_PATTERNS],
    exclude: config.exclude ?? [],
    ignorePatterns: config.ignorePatterns,
    tsConfigPath: resolveParserProjectPath(config.parserOptions, process.cwd()),
    respectGitignore: true,
    debug: options.debug,
    cache,
  });

  if (!scanResult.ok) {
    reporter.error(
      new Error(`File discovery failed: ${scanResult.error.message}`)
    );
    return null;
  }

  reporter.info(
    `❯ Found ${scanResult.data.files.length} files in ${(performance.now() - tStart).toFixed(0)}ms`
  );
  reporter.debug(
    `File discovery: ${(performance.now() - tStart).toFixed(2)}ms`
  );
  return scanResult.data.files;
}

export async function resolveRulesStep(
  config: NormalizedAnalyzerConfig,
  options: AnalyzeOptions,
  reporter: Reporter
): Promise<ResolvedRulesMap | null> {
  const tStart = performance.now();
  reporter.step('❯ Loading rules...');

  let effectiveConfig: NormalizedAnalyzerConfig = config;
  if (options.rule) {
    reporter.info(`Filtering analysis to single rule: ${options.rule}`);
    effectiveConfig = {
      ...config,
      rules: {
        [options.rule]: 'error',
      },
      extends: [],
    };
  }

  const rulesResult = await resolveRules(effectiveConfig, process.cwd());

  if (!rulesResult.ok) {
    reporter.error(
      new Error(`Rule resolution failed: ${rulesResult.error.message}`)
    );
    return null;
  }

  const enabledRules = getEnabledRules(rulesResult.data.rules);
  reporter.info(
    `❯ Loaded ${enabledRules.size} active rules in ${(performance.now() - tStart).toFixed(0)}ms`
  );
  reporter.debug(
    `Rule resolution: ${(performance.now() - tStart).toFixed(2)}ms`
  );
  return enabledRules;
}

export async function buildPlanStep(
  files: ReadonlyArray<string>,
  rules: ResolvedRulesMap,
  cache: CacheContext | undefined,
  options: AnalyzeOptions,
  reporter: Reporter,
  config: NormalizedAnalyzerConfig,
  maxWorkers: number
): Promise<ExecutionPlanOutput | null> {
  const tStart = performance.now();
  reporter.step('❯ Planning analysis...');

  const planResult = await buildExecutionPlan({
    files,
    rules,
    rootDir: process.cwd(),
    cache,
    debug: options.debug,
    incremental: options.force ? { forceRerun: true } : undefined,
    workerCount: maxWorkers,
    overrides: config.overrides,
  });

  if (!planResult.ok) {
    reporter.error(
      new Error(`Execution plan building failed: ${planResult.error.message}`)
    );
    return null;
  }

  if (planResult.data.precomputedAnalysis) {
    reporter.info('❯ Reused cached analysis plan');
  } else {
    reporter.info(
      `❯ Prepared ${planResult.data.tasks.length.toLocaleString()} checks in ${(performance.now() - tStart).toFixed(0)}ms`
    );
  }

  reporter.debug(`Plan build: ${(performance.now() - tStart).toFixed(2)}ms`);
  return planResult.data;
}

export async function runAnalysisStep(
  plan: ExecutionPlanOutput,
  cache: CacheContext | undefined,
  performanceOptions: EffectivePerformanceOptions,
  options: AnalyzeOptions,
  reporter: Reporter,
  files: ReadonlyArray<string> | undefined,
  config: NormalizedAnalyzerConfig | undefined,
  onProgress: (completed: number, total: number) => void,
  onFileProgress: (event: AnalysisFileProgress) => void,
  onNotice: (message: string) => void
): Promise<AnalysisResult | null> {
  const tStart = performance.now();

  configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

  const result = await runAnalysis(plan, {
    rootDir: process.cwd(),
    cache,
    debug: options.debug,
    files,
    maxWorkers: performanceOptions.maxWorkers,
    typeAwareFileConcurrency: performanceOptions.typeAwareFileConcurrency,
    skipTypeCheck: options.skipTypeCheck,
    parserOptions: config?.parserOptions,
    onProgress,
    onFileProgress,
    onNotice,
  });

  if (!result.ok) {
    reporter.error(new Error(`Analysis failed: ${result.error.message}`));
    return null;
  }

  reporter.debug(`Execution: ${(performance.now() - tStart).toFixed(2)}ms`);
  return result.data;
}

export async function saveToCacheStep(
  results: readonly RuleResult[],
  cache: CacheContext | undefined,
  options: AnalyzeOptions,
  reporter: Reporter
): Promise<void> {
  if (!cache) {
    return;
  }
  const tStart = performance.now();
  const cacheEntries: [string, RuleResult][] = [];

  for (const result of results) {
    if (result.taskId) {
      cacheEntries.push([result.taskId, result]);
    }
  }

  if (cacheEntries.length > 0) {
    await cache.results.setMany(cacheEntries);
    if (options.debug) {
      reporter.debug(
        `Saved ${cacheEntries.length} results to cache (${(performance.now() - tStart).toFixed(2)}ms)`
      );
    }
  }
}
