import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import type { ParserOptions } from '@ngcompass/common';
import { getReporter, type Reporter } from '@ngcompass/reporters';
import {
  buildImportGraphOxc,
  findCircularDependencies,
  collectNeighborhood,
  scopeGraphToNodes,
  filterCyclesByNeighborhood,
} from '@ngcompass/engine';
import { Spinner } from '../spinner.js';
import { exitWithError } from './exit.js';
import { loadConfigurationStep, discoverFilesStep } from './analyze/steps.js';
import {
  openCircularReport,
  writeCircularUiReport,
} from './circular-ui.js';
import { toJsonGraph } from './circular-export.js';

type CircularFormat = 'console' | 'ui' | 'json';
type ImportGraph = ReadonlyMap<string, ReadonlySet<string>>;

const DEFAULT_DEPTH = 1;
const MAX_AMBIGUOUS_MATCHES = 10;

interface CircularOptions {
  readonly profile?: string;
  readonly force?: boolean;
  readonly format?: string;
  readonly output?: string;
  readonly focus?: string;
  readonly depth?: string;
}

export function registerCircularCommand(
  program: Command,
  cache: CacheContext
): void {
  program
    .command('circular')
    .description('Detect circular dependencies in the project import graph')
    .option('-p, --profile <name>', 'Configuration profile to run')
    .option('--force', 'Ignore cached results and re-run all checks')
    .option('--format <fmt>', 'Reporter format: console | ui | json')
    .option('--focus <file>', 'Scope to a file and its import neighborhood')
    .option(
      '--depth <n>',
      `Neighborhood radius in import hops for --focus (default: ${DEFAULT_DEPTH})`
    )
    .option(
      '--output <path>',
      'Write the report/export to a file instead of stdout'
    )
    .action(async (rawOptions: CircularOptions) => {
      const format = normalizeFormat(rawOptions.format);
      const isJsonOutput = format === 'json';
      const reporter = getReporter(isJsonOutput ? 'json' : 'console', {});
      let activeCache: CacheContext | undefined = cache;
      let exitCode = 0;

      try {
        const depth = parseDepth(rawOptions.depth);
        if (depth === undefined) {
          reporter.error(new Error('--depth must be a non-negative integer'));
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

        const { config } = configResult;
        activeCache = createRuntimeCache(config, process.cwd());

        const files = await discoverFilesStep(
          config,
          stepOptions,
          activeCache,
          reporter
        );
        if (!files) {
          exitCode = 1;
          return;
        }

        const importGraph = await buildGraph(
          files,
          config.parserOptions,
          reporter
        );

        const focusFile = resolveFocus(importGraph, rawOptions.focus, reporter);
        if (rawOptions.focus && !focusFile) {
          exitCode = 1;
          return;
        }

        const neighborhood = focusFile
          ? collectNeighborhood(importGraph, focusFile, depth)
          : undefined;

        const allCycles = await detectCycles(importGraph);
        const cycles = neighborhood
          ? filterCyclesByNeighborhood(allCycles, neighborhood)
          : allCycles;

        if (isJsonOutput) {
          await emitJsonExport({
            graph: neighborhood
              ? scopeGraphToNodes(importGraph, neighborhood)
              : importGraph,
            cycles,
            rootDir: process.cwd(),
            focus: focusFile ? toRelative(focusFile) : undefined,
            depth,
            fileCount: files.length,
            generatedAt: new Date(),
          }, rawOptions.output);
        } else if (format === 'ui') {
          await emitUiReport(cycles, files.length, rawOptions.output, reporter);
        } else {
          emitConsoleReport(cycles, focusFile, reporter);
        }

        if (cycles.length > 0) {
          exitCode = 1;
        }
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

function normalizeFormat(format: string | undefined): CircularFormat {
  switch (format) {
    case 'ui':
      return 'ui';
    case 'json':
      return 'json';
    default:
      return 'console';
  }
}

function parseDepth(raw: string | undefined): number | undefined {
  if (raw === undefined) return DEFAULT_DEPTH;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

async function buildGraph(
  files: ReadonlyArray<string>,
  parserOptions: ParserOptions | undefined,
  reporter: Reporter
): Promise<ImportGraph> {
  reporter.step('❯ Analyzing import graph for circular dependencies...');

  const spinner = new Spinner(process.stderr);
  spinner.start(`Parsing ${files.length} files and building import graph...`);

  const { importGraph } = await buildImportGraphOxc(files, {
    rootDir: process.cwd(),
    parserOptions,
    onProgress: (done, total) => {
      const pct = ((done / total) * 100).toFixed(0);
      spinner.update(`Parsing files (${done}/${total} — ${pct}%)...`);
    },
  });

  spinner.stop();
  return importGraph;
}

async function detectCycles(graph: ImportGraph): Promise<string[][]> {
  await new Promise((resolve) => setImmediate(resolve));
  return findCircularDependencies(graph);
}

function resolveFocus(
  graph: ImportGraph,
  input: string | undefined,
  reporter: Reporter
): string | undefined {
  if (!input) return undefined;

  const absolute = normalizeSlashes(path.resolve(process.cwd(), input));
  if (graph.has(absolute)) return absolute;

  const needle = normalizeSlashes(input);
  const matches: string[] = [];
  for (const key of graph.keys()) {
    if (key.includes(needle)) matches.push(key);
  }

  if (matches.length === 1) return matches[0];

  if (matches.length === 0) {
    reporter.error(
      new Error(`--focus: no file in the import graph matches "${input}"`)
    );
    return undefined;
  }

  const sample = matches
    .slice(0, MAX_AMBIGUOUS_MATCHES)
    .map((match) => `  ${toRelative(match)}`)
    .join('\n');
  reporter.error(
    new Error(
      `--focus: "${input}" matched ${matches.length} files; be more specific:\n${sample}`
    )
  );
  return undefined;
}

interface GraphExportInput {
  readonly graph: ImportGraph;
  readonly cycles: ReadonlyArray<ReadonlyArray<string>>;
  readonly rootDir: string;
  readonly focus: string | undefined;
  readonly depth: number;
  readonly fileCount: number;
  readonly generatedAt: Date;
}

async function emitJsonExport(
  input: GraphExportInput,
  outputPath: string | undefined
): Promise<void> {
  const content = toJsonGraph(input);

  if (outputPath) {
    const finalPath = path.resolve(process.cwd(), outputPath);
    await fs.writeFile(finalPath, content, 'utf8');
    const relPath = path.relative(process.cwd(), finalPath) || finalPath;
    process.stderr.write(`${pc.green('✔')} Wrote JSON graph to ${relPath}\n`);
    return;
  }

  process.stdout.write(content);
}

async function emitUiReport(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  fileCount: number,
  outputPath: string | undefined,
  reporter: Reporter
): Promise<void> {
  reporter.step('❯ Writing report...');
  const reportPath = await writeCircularUiReport(
    {
      cycles,
      rootDir: process.cwd(),
      fileCount,
      generatedAt: new Date(),
    },
    outputPath
  );

  const relPath = path.relative(process.cwd(), reportPath) || reportPath;
  if (cycles.length > 0) {
    reporter.info(
      `\n${pc.red('✖')} Found ${cycles.length} circular ${pluralize(cycles.length)}. Report: ${pc.cyan(relPath)}\n`
    );
  } else {
    reporter.info(
      `\n${pc.green('✔')} No circular dependencies found. Report: ${pc.cyan(relPath)}\n`
    );
  }

  try {
    openCircularReport(reportPath);
  } catch {
    reporter.info(pc.dim(`(Open ${relPath} in your browser to view.)`));
  }
}

function emitConsoleReport(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  focusFile: string | undefined,
  reporter: Reporter
): void {
  if (cycles.length > 0) {
    reporter.info(formatCyclesReport(cycles, process.cwd()));
    return;
  }

  if (focusFile) {
    reporter.info(
      `\n${pc.green('✔')} No circular dependencies found near ${pc.cyan(toRelative(focusFile))}.\n`
    );
    return;
  }

  reporter.info(`\n${pc.green('✔')} No circular dependencies found.\n`);
}

function formatCyclesReport(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  cwd: string
): string {
  const lines: string[] = [
    '',
    pc.red(`✖ Found ${cycles.length} circular ${pluralize(cycles.length)}`),
    '',
  ];

  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    const formatted = cycle
      .map((file) => pc.cyan(path.relative(cwd, file) || file))
      .join(pc.dim(' → '));

    lines.push(`${pc.dim(`${i + 1})`)} ${formatted}`);
  }
  lines.push('');
  return lines.join('\n');
}

function pluralize(n: number): string {
  return n === 1 ? 'dependency' : 'dependencies';
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function toRelative(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return normalizeSlashes(rel || file);
}
