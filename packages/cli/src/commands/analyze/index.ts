import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import { getReporter, type ResultSummary } from '@ngcompass/reporters';
import { Spinner } from '../../spinner.js';
import { exitWithError } from '../exit.js';
import { resolvePerformanceOptions, type AnalyzeOptions } from './options.js';
import {
  formatAnalysisProgressMessage,
  normalizeReporterFormat,
  resolveReporterFormat,
  shouldFailAnalysis,
  toError,
} from './resolve.js';
import {
  buildPlanStep,
  discoverFilesStep,
  loadConfigurationStep,
  resolveRulesStep,
  runAnalysisStep,
  saveToCacheStep,
} from './steps.js';
import { createFileProgressLogger } from './progress.js';

export function registerAnalyzeCommand(
  program: Command,
  cache: CacheContext
): void {
  program
    .command('analyze')
    .description(
      'Analyze your project and report rule violations and architecture risks'
    )
    .option('-p, --profile <name>', 'Configuration profile to run')
    .option('--force', 'Ignore cached results and re-run all checks')
    .option(
      '--format <fmt>',
      'Reporter format: console | json | sarif | html | ui'
    )
    .option('--compact', 'Use compact, ESLint-style output')
    .option(
      '-q, --quiet',
      'Show summary counts only, suppress violation details'
    )
    .option('--no-recommendation', 'Suppress fix recommendations from output')
    .option(
      '--output <path>',
      'Output path for UI reports (default: ngcompass-report.html)'
    )
    .option(
      '--rule <id>',
      'Run only one rule (useful for debugging or focused checks)'
    )
    .option(
      '--max-workers <n>',
      'Cap the number of worker threads (lower = less memory, e.g. --max-workers 2)'
    )
    .option(
      '--skip-type-check',
      'Skip rules that require the TypeScript type checker (fastest, lowest memory)'
    )
    .action(async (options: AnalyzeOptions) => {
      const startTime = performance.now();
      let reporter = getReporter(normalizeReporterFormat(options.format), {
        compact: !!options.compact,
        outputPath: options.output,
        quiet: !!options.quiet,
        noRecommendation: options.recommendation === false,
      });
      let activeCache: CacheContext | undefined = cache;

      let exitCode = 0;

      try {
        const configResult = await loadConfigurationStep(
          options,
          cache,
          reporter
        );
        if (!configResult) {
          exitCode = 1;
          return;
        }

        const { config } = configResult;
        const performanceOptions = resolvePerformanceOptions(options, config);
        activeCache = createRuntimeCache(config, process.cwd());
        const reporterFormat = resolveReporterFormat(
          options.format,
          config.outputFormat
        );
        reporter = getReporter(reporterFormat, {
          compact: !!options.compact,
          outputPath: options.output ?? config.outputPath,
          quiet: !!options.quiet,
          noRecommendation: options.recommendation === false,
        });

        const files = await discoverFilesStep(
          config,
          options,
          activeCache,
          reporter
        );
        if (!files) {
          exitCode = 1;
          return;
        }

        const enabledRules = await resolveRulesStep(config, options, reporter);
        if (!enabledRules) {
          exitCode = 1;
          return;
        }

        const plan = await buildPlanStep(
          files,
          enabledRules,
          activeCache,
          options,
          reporter,
          config,
          performanceOptions.maxWorkers
        );
        if (!plan) {
          exitCode = 1;
          return;
        }

        const progressStream =
          reporterFormat === 'console' ? process.stdout : process.stderr;
        const spinner = new Spinner(progressStream);
        const totalChecks =
          plan.tasks.length + (plan.skippedTasks?.length ?? 0);
        spinner.start(formatAnalysisProgressMessage(0, totalChecks));
        const logFileProgress = createFileProgressLogger(
          plan,
          (line) => spinner.writeLine(line),
          process.cwd()
        );
        const updateAnalysisProgress = (
          completed: number,
          total: number
        ): void => {
          spinner.update(formatAnalysisProgressMessage(completed, total));
        };
        const logNotice = (message: string): void => {
          spinner.writeLine(`${pc.yellow('[!]')} ${pc.yellow(message)}`);
        };
        const skippedFiles: string[] = [];
        const recordSkippedFile = (filePath: string): void => {
          skippedFiles.push(filePath);
        };
        const analysis = await runAnalysisStep(
          plan,
          activeCache,
          performanceOptions,
          options,
          reporter,
          files,
          config,
          updateAnalysisProgress,
          logFileProgress,
          logNotice,
          recordSkippedFile
        );
        spinner.stop();
        if (!analysis) {
          exitCode = 1;
          return;
        }

        const duration = performance.now() - startTime;
        const scannedFiles = new Set([
          ...plan.tasks.map((t) => t.filePath),
          ...(plan.skippedTasks ?? []).map((t) => t.filePath),
        ]).size;

        const summary: ResultSummary = {
          scannedFiles,
          discoveredFiles: files.length,
          totalFiles: analysis.stats.totalFiles,
          totalTasks: plan.tasks.length + (plan.skippedTasks?.length ?? 0),
          cachedTasks: plan.precomputedAnalysis ? plan.tasks.length : undefined,
          totalErrors: analysis.stats.totalErrors,
          totalWarnings: analysis.stats.totalWarnings,
          failOnSeverity: config.failOnSeverity,
          maxWarnings: config.maxWarnings,
          skippedFiles: skippedFiles.length || undefined,
          skippedFilePaths: skippedFiles.length ? skippedFiles : undefined,
          duration,
        };
        if (reporterFormat === 'console') {
          reporter.summary(summary);
        }

        reporter.parseErrors(analysis.parseErrors);
        reporter.report(analysis.results);

        if (reporterFormat !== 'console') {
          reporter.step('❯ Writing report...');
          reporter.summary(summary);
        }

        if (!plan.precomputedAnalysis) {
          await saveToCacheStep(
            analysis.results,
            activeCache,
            options,
            reporter
          );
        }

        if (shouldFailAnalysis(config, analysis.stats)) {
          exitCode = 1;
        }
      } catch (error: unknown) {
        reporter.error(toError(error));
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
