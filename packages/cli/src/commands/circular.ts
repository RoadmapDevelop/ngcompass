import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import type { ParserOptions } from '@ngcompass/common';
import {
  getReporter,
  type Reporter,
  type ReporterFormat,
} from '@ngcompass/reporters';
import {
  buildImportGraphOxc,
  findCircularDependencies,
} from '@ngcompass/engine';
import { Spinner } from '../spinner.js';
import { exitWithError } from './exit.js';
import { loadConfigurationStep, discoverFilesStep } from './analyze/steps.js';
import {
  openCircularReport,
  writeCircularUiReport,
} from './circular-ui.js';

type CircularFormat = 'console' | 'ui';

interface CircularOptions {
  readonly profile?: string;
  readonly force?: boolean;
  readonly format?: ReporterFormat;
  readonly output?: string;
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
    .option('--format <fmt>', 'Reporter format: console | ui')
    .option(
      '--output <path>',
      'Output path for UI reports (default: ngcompass-circular-report.html)'
    )
    .action(async (rawOptions: CircularOptions) => {
      const reporter = getReporter('console', {});
      const format = normalizeFormat(rawOptions.format);
      let activeCache: CacheContext | undefined = cache;
      let exitCode = 0;

      try {
        const configResult = await loadConfigurationStep(
          rawOptions,
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
          rawOptions,
          activeCache,
          reporter
        );
        if (!files) {
          exitCode = 1;
          return;
        }

        const cycles = await detectCycles(
          files,
          config.parserOptions,
          reporter
        );

        if (format === 'ui') {
          await emitUiReport(
            cycles,
            files.length,
            rawOptions.output,
            reporter
          );
        } else {
          emitConsoleReport(cycles, reporter);
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

function normalizeFormat(format: ReporterFormat | undefined): CircularFormat {
  if (format === 'ui') return 'ui';
  return 'console';
}

async function detectCycles(
  files: ReadonlyArray<string>,
  parserOptions: ParserOptions | undefined,
  reporter: Reporter
): Promise<string[][]> {
  reporter.step('❯ Analyzing import graph for circular dependencies...');

  const spinner = new Spinner(process.stderr);
  spinner.start(
    `Parsing ${files.length} files and building import graph...`
  );

  const { importGraph } = await buildImportGraphOxc(files, {
    rootDir: process.cwd(),
    parserOptions,
    onProgress: (done, total) => {
      const pct = ((done / total) * 100).toFixed(0);
      spinner.update(`Parsing files (${done}/${total} — ${pct}%)...`);
    },
  });

  spinner.update('Detecting cycles in import graph...');
  await new Promise((resolve) => setImmediate(resolve));

  const cycles = findCircularDependencies(importGraph);
  spinner.stop();

  return cycles;
}

function emitConsoleReport(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  reporter: Reporter
): void {
  if (cycles.length > 0) {
    reporter.info(formatCyclesReport(cycles, process.cwd()));
  } else {
    reporter.info(`\n${pc.green('✔')} No circular dependencies found.\n`);
  }
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
