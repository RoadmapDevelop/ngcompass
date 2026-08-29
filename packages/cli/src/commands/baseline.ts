import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  createEmptyBaseline,
  loadBaseline,
  mergeIntoBaseline,
  pruneBaseline,
  saveBaseline,
  summarizeBaseline,
  type BaselineScope,
} from '@ngcompass/baseline';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import type {
  AnalysisResult,
  BaselineFile,
  NormalizedAnalyzerConfig,
} from '@ngcompass/common';
import type { ExecutionPlanOutput } from '@ngcompass/planner';
import {
  getBaselineReporter,
  getReporter,
  type Reporter,
} from '@ngcompass/reporters';
import { Spinner } from '../spinner.js';
import type { AnalyzeOptions } from '../models/index.js';
import {
  buildBaselineScope,
  describeBaselineError,
} from './analyze/baseline.js';
import { resolvePerformanceOptions } from './analyze/options.js';
import {
  buildPlanStep,
  discoverFilesStep,
  loadConfigurationStep,
  resolveRulesStep,
  runAnalysisStep,
} from './analyze/steps.js';
import { exitWithError } from './exit.js';

interface BaselineCommandOptions {
  readonly profile?: string;
  readonly rule?: string;
  readonly path?: string;
  readonly force?: boolean;
  readonly top?: string;
  readonly maxWorkers?: string;
  readonly skipTypeCheck?: boolean;
  readonly debug?: boolean;
}

interface ColdRun {
  readonly config: NormalizedAnalyzerConfig;
  readonly plan: ExecutionPlanOutput;
  readonly analysis: AnalysisResult;
  readonly scope: BaselineScope;
}

const DEFAULT_FILES_PER_RULE = 3;

export function registerBaselineCommand(
  program: Command,
  cache: CacheContext
): void {
  const baselineCmd = program
    .command('baseline')
    .description(
      'Record existing violations so CI fails only on newly introduced ones'
    );

  registerCreate(baselineCmd, cache);
  registerUpdate(baselineCmd, cache);
  registerPrune(baselineCmd, cache);
  registerShow(baselineCmd, cache);
}

function withAnalysisOptions(command: Command): Command {
  return command
    .option('-p, --profile <name>', 'Configuration profile to run')
    .option('--path <path>', 'Baseline file path')
    .option('--max-workers <n>', 'Cap the number of worker threads')
    .option('--skip-type-check', 'Skip rules that require the type checker')
    .option('--debug', 'Print debug diagnostics');
}

function registerCreate(baselineCmd: Command, cache: CacheContext): void {
  withAnalysisOptions(
    baselineCmd
      .command('create')
      .description('Record every current violation as the baseline')
  )
    .option('--rule <id>', 'Record only one rule')
    .option('--force', 'Overwrite an existing baseline file')
    .action(async (options: BaselineCommandOptions) => {
      const run = await runColdAnalysis(options, cache);
      if (!run) return;

      const baselinePath = resolvePath(options, run.config);
      const existing = await loadBaseline(baselinePath, process.cwd());

      if (existing.ok && !options.force) {
        fail(
          `A baseline already exists at ${relative(baselinePath)}. Use 'ngcompass baseline update' to refresh it, or --force to replace it.`
        );
        return;
      }

      const baseline = mergeIntoBaseline(
        createEmptyBaseline(),
        run.analysis.results,
        run.scope,
        process.cwd()
      );
      await writeBaseline(baseline, baselinePath, run.scope);
    });
}

function registerUpdate(baselineCmd: Command, cache: CacheContext): void {
  withAnalysisOptions(
    baselineCmd
      .command('update')
      .description('Refresh baseline counts for the rules and files scanned')
  )
    .option('--rule <id>', 'Update only one rule, leaving the rest untouched')
    .action(async (options: BaselineCommandOptions) => {
      const run = await runColdAnalysis(options, cache);
      if (!run) return;

      const baselinePath = resolvePath(options, run.config);
      const existing = await readExistingOrEmpty(baselinePath);
      if (!existing) return;

      const baseline = mergeIntoBaseline(
        existing,
        run.analysis.results,
        run.scope,
        process.cwd()
      );
      const kept = countUnscannedEntries(existing, run.scope);
      await writeBaseline(baseline, baselinePath, run.scope);

      if (kept > 0) {
        write(
          pc.dim(
            `  ${kept} file${kept === 1 ? '' : 's'} in the baseline were not scanned in this run - entries kept.`
          )
        );
      }
    });
}

function registerPrune(baselineCmd: Command, cache: CacheContext): void {
  withAnalysisOptions(
    baselineCmd
      .command('prune')
      .description('Lower baseline counts to reality and drop stale entries')
  ).action(async (options: BaselineCommandOptions) => {
    const run = await runColdAnalysis(options, cache);
    if (!run) return;

    const baselinePath = resolvePath(options, run.config);
    const existing = await loadBaseline(baselinePath, process.cwd());
    if (!existing.ok) {
      fail(describeBaselineError(existing.error));
      return;
    }

    const outcome = pruneBaseline(
      existing.data,
      run.analysis.results,
      run.scope,
      process.cwd()
    );
    await writeBaseline(outcome.baseline, baselinePath, run.scope);

    for (const rename of outcome.renamed) {
      write(pc.dim(`  moved: ${rename.from} -> ${rename.to}`));
    }
    if (outcome.removedFiles.length > 0) {
      write(
        pc.dim(
          `  removed ${outcome.removedFiles.length} entr${outcome.removedFiles.length === 1 ? 'y' : 'ies'} for files that no longer exist`
        )
      );
    }
  });
}

function registerShow(baselineCmd: Command, cache: CacheContext): void {
  baselineCmd
    .command('show')
    .description('List the violations currently hidden by the baseline')
    .option('-p, --profile <name>', 'Configuration profile to run')
    .option('--path <path>', 'Baseline file path')
    .option('--top <n>', 'Files to list under each rule (default 3)')
    .action(async (options: BaselineCommandOptions) => {
      const reporter = getReporter('console', {});
      const configResult = await loadConfigurationStep(
        { profile: options.profile },
        cache,
        reporter
      );
      if (!configResult) {
        exitWithError();
        return;
      }

      const baselinePath = resolvePath(options, configResult.config);
      const loaded = await loadBaseline(baselinePath, process.cwd());
      if (!loaded.ok) {
        fail(describeBaselineError(loaded.error));
        return;
      }

      getBaselineReporter().renderBaseline(
        summarizeBaseline(
          loaded.data,
          relative(baselinePath),
          parseTop(options.top)
        )
      );
    });
}

async function runColdAnalysis(
  options: BaselineCommandOptions,
  cache: CacheContext
): Promise<ColdRun | null> {
  const analyzeOptions: AnalyzeOptions = {
    profile: options.profile,
    rule: options.rule,
    force: true,
    debug: options.debug,
    maxWorkers: options.maxWorkers,
    skipTypeCheck: options.skipTypeCheck,
  };

  const reporter = getReporter('console', {});
  const configResult = await loadConfigurationStep(
    analyzeOptions,
    cache,
    reporter
  );
  if (!configResult) return abort();

  const { config } = configResult;
  const runtimeCache = createRuntimeCache(config, process.cwd());
  const performanceOptions = resolvePerformanceOptions(analyzeOptions, config);

  const files = await discoverFilesStep(
    config,
    analyzeOptions,
    runtimeCache,
    reporter
  );
  if (!files) return abort();

  const rules = await resolveRulesStep(config, analyzeOptions, reporter);
  if (!rules) return abort();

  const plan = await buildPlanStep(
    files,
    rules,
    runtimeCache,
    analyzeOptions,
    reporter,
    config,
    performanceOptions.maxWorkers
  );
  if (!plan) return abort();

  const scope = buildBaselineScope(plan, files, rules);
  if (scope.files.size === 0 && files.length > 0) {
    reporter.error(
      new Error(
        'The execution plan produced no tasks for the discovered files, so a baseline written now would be empty. This is a bug - please report it.'
      )
    );
    return abort();
  }

  const analysis = await runColdExecution(
    plan,
    runtimeCache,
    analyzeOptions,
    performanceOptions,
    reporter,
    files,
    config
  );
  if (!analysis) return abort();

  await runtimeCache?.flush();
  return { config, plan, analysis, scope };
}

async function runColdExecution(
  plan: ExecutionPlanOutput,
  runtimeCache: CacheContext | undefined,
  analyzeOptions: AnalyzeOptions,
  performanceOptions: { maxWorkers: number },
  reporter: Reporter,
  files: ReadonlyArray<string>,
  config: NormalizedAnalyzerConfig
): Promise<AnalysisResult | null> {
  const spinner = new Spinner(process.stderr);
  spinner.start('Running a full analysis for the baseline...');

  const analysis = await runAnalysisStep(
    plan,
    runtimeCache,
    performanceOptions,
    analyzeOptions,
    reporter,
    files,
    config,
    () => {},
    () => {},
    (message: string) => spinner.writeLine(pc.yellow(`[!] ${message}`)),
    () => {}
  );

  spinner.stop();
  return analysis;
}

function abort(): null {
  exitWithError();
  return null;
}

async function readExistingOrEmpty(
  baselinePath: string
): Promise<BaselineFile | null> {
  const existing = await loadBaseline(baselinePath, process.cwd());
  if (existing.ok) return existing.data;
  if (existing.error.kind === 'BaselineNotFound') return createEmptyBaseline();

  fail(describeBaselineError(existing.error));
  return null;
}

async function writeBaseline(
  baseline: BaselineFile,
  baselinePath: string,
  scope: BaselineScope
): Promise<void> {
  const saved = await saveBaseline(baseline, baselinePath, process.cwd());
  if (!saved.ok) {
    fail(describeBaselineError(saved.error));
    return;
  }

  const { files, violations } = summarize(baseline);
  write(`${pc.green('❯')} Baseline written: ${relative(saved.data)}`);
  write(
    pc.dim(
      `  ${pluralize(violations, 'violation')} recorded across ${pluralize(files, 'file')} (${pluralize(scope.rules.size, 'rule')} scanned)`
    )
  );
}

function summarize(baseline: BaselineFile): {
  files: number;
  violations: number;
} {
  let violations = 0;
  const fileKeys = Object.keys(baseline.entries);

  for (const filePath of fileKeys) {
    const counts = baseline.entries[filePath];
    for (const ruleName of Object.keys(counts)) {
      violations += counts[ruleName];
    }
  }

  return { files: fileKeys.length, violations };
}

function countUnscannedEntries(
  baseline: BaselineFile,
  scope: BaselineScope
): number {
  const scannedKeys = new Set<string>();
  for (const file of scope.files) {
    scannedKeys.add(path.relative(process.cwd(), file).replace(/\\/g, '/'));
  }

  let count = 0;
  for (const fileKey of Object.keys(baseline.entries)) {
    if (!scannedKeys.has(fileKey)) count++;
  }
  return count;
}

function pluralize(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

function resolvePath(
  options: BaselineCommandOptions,
  config: NormalizedAnalyzerConfig
): string {
  return options.path ?? config.baseline.path;
}

function parseTop(value: string | undefined): number {
  if (value === undefined) return DEFAULT_FILES_PER_RULE;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_FILES_PER_RULE;
}

function relative(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath) || absolutePath;
}

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): void {
  process.stderr.write(`${pc.red('×')} ${message}\n`);
  exitWithError();
}
