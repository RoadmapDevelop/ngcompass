import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import { getReporter, type Reporter } from '@ngcompass/reporters';
import {
  computeProjectComplexity,
  type FileComplexity,
  type FunctionComplexity,
} from '@ngcompass/engine';
import { Spinner } from '../spinner.js';
import { exitWithError } from './exit.js';
import { loadConfigurationStep, discoverFilesStep } from './analyze/steps.js';

type SortMetric = 'cyclomatic' | 'cognitive';

const DEFAULT_OUTPUT_PATH = 'ngcompass-complexity.json';
const DEFAULT_SORT: SortMetric = 'cognitive';
const CONSOLE_FILE_LIMIT = 15;
const CONSOLE_FUNCTION_LIMIT = 5;

interface ComplexityOptions {
  readonly profile?: string;
  readonly force?: boolean;
  readonly output?: string;
  readonly stdout?: boolean;
  readonly min?: string;
  readonly sort?: string;
}

interface FileReport {
  readonly filePath: string;
  readonly fileCyclomatic: number;
  readonly fileCognitive: number;
  readonly maxCyclomatic: number;
  readonly maxCognitive: number;
  readonly functionCount: number;
  readonly functions: readonly FunctionComplexity[];
}

interface ComplexityReport {
  readonly sortedBy: SortMetric;
  readonly min: number;
  readonly fileCount: number;
  readonly functionCount: number;
  readonly maxCyclomatic: number;
  readonly maxCognitive: number;
  readonly avgCyclomatic: number;
  readonly avgCognitive: number;
  readonly files: readonly FileReport[];
}

export function registerComplexityCommand(
  program: Command,
  cache: CacheContext
): void {
  program
    .command('complexity')
    .description(
      'Report cyclomatic and cognitive complexity per function, grouped by file'
    )
    .option('-p, --profile <name>', 'Configuration profile to run')
    .option('--force', 'Ignore cached results and re-run all checks')
    .option(
      '--min <n>',
      'Only include functions whose worst metric is at least n'
    )
    .option(
      '--sort <metric>',
      `Ranking metric: cyclomatic | cognitive (default: ${DEFAULT_SORT})`
    )
    .option(
      '--output <path>',
      `Output path for the JSON file (default: ${DEFAULT_OUTPUT_PATH})`
    )
    .option('--stdout', 'Write JSON to stdout instead of a file')
    .action(async (rawOptions: ComplexityOptions) => {
      const reporter = getReporter(rawOptions.stdout ? 'json' : 'console', {});
      let activeCache: CacheContext | undefined = cache;
      let exitCode = 0;

      try {
        const min = parseMin(rawOptions.min);
        if (min === undefined) {
          reporter.error(new Error('--min must be a non-negative integer'));
          exitCode = 1;
          return;
        }

        const sort = parseSort(rawOptions.sort);
        if (sort === undefined) {
          reporter.error(
            new Error('--sort must be "cyclomatic" or "cognitive"')
          );
          exitCode = 1;
          return;
        }

        const stepOptions = {
          profile: rawOptions.profile,
          force: rawOptions.force,
        };

        const configResult = await loadConfigurationStep(
          stepOptions,
          cache,
          reporter
        );
        if (!configResult) {
          exitCode = 1;
          return;
        }

        activeCache = createRuntimeCache(configResult.config, process.cwd());

        const files = await discoverFilesStep(
          configResult.config,
          stepOptions,
          activeCache,
          reporter
        );
        if (!files) {
          exitCode = 1;
          return;
        }

        const fileComplexities = await analyzeComplexity(files, reporter);
        const report = buildReport(fileComplexities, sort, min);

        if (rawOptions.stdout) {
          process.stdout.write(toComplexityJson(report, process.cwd()));
          return;
        }

        await writeJsonFile(
          toComplexityJson(report, process.cwd()),
          rawOptions.output,
          reporter
        );
        printSummary(report, reporter);
      } catch (error: unknown) {
        reporter.error(
          error instanceof Error ? error : new Error(String(error))
        );
        exitCode = 1;
      } finally {
        if (activeCache && activeCache !== cache) {
          await activeCache.flush();
        }
        if (exitCode !== 0) {
          exitWithError(exitCode);
        }
      }
    });
}

function parseMin(raw: string | undefined): number | undefined {
  if (raw === undefined) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function parseSort(raw: string | undefined): SortMetric | undefined {
  if (raw === undefined) return DEFAULT_SORT;
  if (raw === 'cyclomatic' || raw === 'cognitive') return raw;
  return undefined;
}

async function analyzeComplexity(
  files: ReadonlyArray<string>,
  reporter: Reporter
): Promise<readonly FileComplexity[]> {
  reporter.step('❯ Measuring code complexity...');

  const spinner = new Spinner(process.stderr);
  spinner.start(`Parsing ${files.length} files and scoring functions...`);

  const result = await computeProjectComplexity(files, {
    rootDir: process.cwd(),
    onProgress: (done, total) => {
      const pct = ((done / total) * 100).toFixed(0);
      spinner.update(`Scoring functions (${done}/${total} — ${pct}%)...`);
    },
  });

  spinner.stop();
  return result;
}

function metricOf(fn: FunctionComplexity, sort: SortMetric): number {
  return sort === 'cyclomatic' ? fn.cyclomatic : fn.cognitive;
}

function worstMetric(fn: FunctionComplexity): number {
  return Math.max(fn.cyclomatic, fn.cognitive);
}

function buildReport(
  fileComplexities: readonly FileComplexity[],
  sort: SortMetric,
  min: number
): ComplexityReport {
  const files: FileReport[] = [];
  let functionCount = 0;
  let maxCyclomatic = 0;
  let maxCognitive = 0;
  let sumCyclomatic = 0;
  let sumCognitive = 0;

  for (const file of fileComplexities) {
    const included = file.functions.filter((fn) => worstMetric(fn) >= min);
    if (included.length === 0) continue;

    const ranked = [...included].sort(
      (a, b) => metricOf(b, sort) - metricOf(a, sort) || worstMetric(b) - worstMetric(a)
    );

    let fileCyclomatic = 0;
    let fileCognitive = 0;
    let fileMaxCyclomatic = 0;
    let fileMaxCognitive = 0;
    for (const fn of ranked) {
      fileCyclomatic += fn.cyclomatic;
      fileCognitive += fn.cognitive;
      if (fn.cyclomatic > fileMaxCyclomatic) fileMaxCyclomatic = fn.cyclomatic;
      if (fn.cognitive > fileMaxCognitive) fileMaxCognitive = fn.cognitive;
    }

    functionCount += ranked.length;
    sumCyclomatic += fileCyclomatic;
    sumCognitive += fileCognitive;
    if (fileMaxCyclomatic > maxCyclomatic) maxCyclomatic = fileMaxCyclomatic;
    if (fileMaxCognitive > maxCognitive) maxCognitive = fileMaxCognitive;

    files.push({
      filePath: file.filePath,
      fileCyclomatic,
      fileCognitive,
      maxCyclomatic: fileMaxCyclomatic,
      maxCognitive: fileMaxCognitive,
      functionCount: ranked.length,
      functions: ranked,
    });
  }

  const fileMetric = (file: FileReport): number =>
    sort === 'cyclomatic' ? file.maxCyclomatic : file.maxCognitive;
  const fileSum = (file: FileReport): number =>
    sort === 'cyclomatic' ? file.fileCyclomatic : file.fileCognitive;
  files.sort((a, b) => fileMetric(b) - fileMetric(a) || fileSum(b) - fileSum(a));

  return {
    sortedBy: sort,
    min,
    fileCount: files.length,
    functionCount,
    maxCyclomatic,
    maxCognitive,
    avgCyclomatic: roundAverage(sumCyclomatic, functionCount),
    avgCognitive: roundAverage(sumCognitive, functionCount),
    files,
  };
}

function roundAverage(sum: number, count: number): number {
  if (count === 0) return 0;
  return Math.round((sum / count) * 100) / 100;
}

function toComplexityJson(report: ComplexityReport, rootDir: string): string {
  const payload = {
    rootDir,
    generatedAt: new Date().toISOString(),
    sortedBy: report.sortedBy,
    thresholds: { min: report.min },
    summary: {
      fileCount: report.fileCount,
      functionCount: report.functionCount,
      maxCyclomatic: report.maxCyclomatic,
      maxCognitive: report.maxCognitive,
      avgCyclomatic: report.avgCyclomatic,
      avgCognitive: report.avgCognitive,
      functionsOverMin: report.functionCount,
    },
    files: report.files.map((file) => ({
      filePath: file.filePath,
      fileCyclomatic: file.fileCyclomatic,
      fileCognitive: file.fileCognitive,
      maxCyclomatic: file.maxCyclomatic,
      maxCognitive: file.maxCognitive,
      functionCount: file.functionCount,
      functions: file.functions.map((fn) => ({
        name: fn.name,
        kind: fn.kind,
        line: fn.line,
        column: fn.column,
        endLine: fn.endLine,
        lineCount: fn.lineCount,
        cyclomatic: fn.cyclomatic,
        cognitive: fn.cognitive,
      })),
    })),
  };

  return JSON.stringify(payload, null, 2) + '\n';
}

async function writeJsonFile(
  json: string,
  outputPath: string | undefined,
  reporter: Reporter
): Promise<void> {
  reporter.step('❯ Writing complexity report...');
  const finalPath = path.resolve(
    process.cwd(),
    outputPath ?? DEFAULT_OUTPUT_PATH
  );
  await fs.writeFile(finalPath, json, 'utf8');

  const relPath = path.relative(process.cwd(), finalPath) || finalPath;
  reporter.info(
    `\n${pc.green('✔')} Complexity report written to ${pc.cyan(relPath)}\n`
  );
}

function printSummary(report: ComplexityReport, reporter: Reporter): void {
  if (report.fileCount === 0) {
    reporter.info(
      `No functions matched (min ${report.min}). Nothing to report.`
    );
    return;
  }

  reporter.info(
    `${pc.bold('Complexity summary')} — ${report.functionCount} functions in ` +
      `${report.fileCount} files (sorted by ${report.sortedBy})`
  );
  reporter.info(
    `  max cyclomatic ${pc.yellow(String(report.maxCyclomatic))}, ` +
      `max cognitive ${pc.yellow(String(report.maxCognitive))}, ` +
      `avg cyclomatic ${report.avgCyclomatic}, avg cognitive ${report.avgCognitive}`
  );

  const shown = report.files.slice(0, CONSOLE_FILE_LIMIT);
  for (const file of shown) {
    reporter.info(
      `\n${pc.cyan(file.filePath)} ` +
        pc.dim(
          `(cyclomatic ${file.fileCyclomatic}, cognitive ${file.fileCognitive})`
        )
    );
    const functions = file.functions.slice(0, CONSOLE_FUNCTION_LIMIT);
    for (const fn of functions) {
      reporter.info(
        `  ${pc.dim(`${fn.line}:${fn.column}`)} ${fn.name} ` +
          pc.dim(`[${fn.kind}]`) +
          ` — cyclomatic ${pc.yellow(String(fn.cyclomatic))}, ` +
          `cognitive ${pc.yellow(String(fn.cognitive))}`
      );
    }
    const remaining = file.functionCount - functions.length;
    if (remaining > 0) {
      reporter.info(pc.dim(`  …and ${remaining} more`));
    }
  }

  const remainingFiles = report.fileCount - shown.length;
  if (remainingFiles > 0) {
    reporter.info(pc.dim(`\n…and ${remainingFiles} more files`));
  }
}
