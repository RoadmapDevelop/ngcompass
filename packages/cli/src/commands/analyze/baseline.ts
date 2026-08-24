import {
  applyBaseline,
  loadBaseline,
  type BaselineError,
  type BaselineScope,
  type StaleEntry,
} from '@ngcompass/baseline';
import type {
  AnalysisResult,
  BaselineConfig,
  NormalizedAnalyzerConfig,
  ResolvedRulesMap,
  RuleResult,
} from '@ngcompass/common';
import { calculateStats } from '@ngcompass/engine';
import type { ExecutionPlanOutput } from '@ngcompass/planner';
import type { Reporter } from '@ngcompass/reporters';
import type { AnalyzeOptions } from '../../models/index.js';

export interface BaselineApplication {
  readonly results: ReadonlyArray<RuleResult>;
  readonly stats: AnalysisResult['stats'];
  readonly suppressedCount: number;
  readonly staleCount: number;
  readonly failedOnStale: boolean;
}

export function buildBaselineScope(
  plan: ExecutionPlanOutput,
  scannedFiles: ReadonlyArray<string>,
  enabledRules: ResolvedRulesMap
): BaselineScope {
  if (plan.precomputedAnalysis) {
    return {
      files: new Set(scannedFiles),
      rules: new Set(enabledRules.keys()),
    };
  }

  const files = new Set<string>();
  const rules = new Set<string>();

  for (const task of plan.tasks) {
    files.add(task.filePath);
    rules.add(task.ruleName);
  }
  for (const task of plan.skippedTasks) {
    files.add(task.filePath);
    rules.add(task.ruleName);
  }

  return { files, rules };
}

export function resolveBaselineConfig(
  config: NormalizedAnalyzerConfig,
  options: AnalyzeOptions
): BaselineConfig {
  if (options.baseline === false) {
    return { ...config.baseline, enabled: false };
  }

  if (typeof options.baseline === 'string') {
    return { ...config.baseline, enabled: true, path: options.baseline };
  }

  if (options.baseline === true) {
    return { ...config.baseline, enabled: true };
  }

  return config.baseline;
}

export async function applyBaselineStep(
  analysis: AnalysisResult,
  plan: ExecutionPlanOutput,
  scannedFiles: ReadonlyArray<string>,
  enabledRules: ResolvedRulesMap,
  config: NormalizedAnalyzerConfig,
  options: AnalyzeOptions,
  reporter: Reporter,
  rootDir: string
): Promise<BaselineApplication | null> {
  const baselineConfig = resolveBaselineConfig(config, options);

  if (!baselineConfig.enabled) {
    return unfiltered(analysis);
  }

  const loaded = await loadBaseline(baselineConfig.path, rootDir);
  if (!loaded.ok) {
    reporter.error(new Error(describeBaselineError(loaded.error)));
    return null;
  }

  const outcome = applyBaseline(
    analysis.results,
    loaded.data,
    buildBaselineScope(plan, scannedFiles, enabledRules),
    rootDir
  );

  reportReconciliation(
    outcome.renamed.length,
    outcome.ambiguousFiles,
    reporter
  );

  const failedOnStale = reportStale(
    outcome.staleEntries,
    baselineConfig.onStale,
    reporter
  );

  const recomputed = calculateStats(
    outcome.results,
    performance.now(),
    analysis.stats.cacheHitRate
  );

  return {
    results: outcome.results,
    stats: { ...recomputed, duration: analysis.stats.duration },
    suppressedCount: outcome.suppressedCount,
    staleCount: outcome.staleEntries.length,
    failedOnStale,
  };
}

function unfiltered(analysis: AnalysisResult): BaselineApplication {
  return {
    results: analysis.results,
    stats: analysis.stats,
    suppressedCount: 0,
    staleCount: 0,
    failedOnStale: false,
  };
}

function reportReconciliation(
  renamedCount: number,
  ambiguousFiles: ReadonlyArray<string>,
  reporter: Reporter
): void {
  if (renamedCount > 0) {
    reporter.info(
      `❯ ${renamedCount} renamed ${pluralizeFile(renamedCount)} matched by name - run 'ngcompass baseline prune' to record the new path`
    );
  }

  if (ambiguousFiles.length > 0) {
    reporter.info(
      `❯ ${ambiguousFiles.length} baseline ${pluralizeFile(ambiguousFiles.length)} could not be matched after a move; their violations are reported as new`
    );
  }
}

function reportStale(
  staleEntries: ReadonlyArray<StaleEntry>,
  onStale: BaselineConfig['onStale'],
  reporter: Reporter
): boolean {
  if (onStale === 'ignore' || staleEntries.length === 0) {
    return false;
  }

  const fixed = countFixed(staleEntries);
  const message = `${fixed} baselined ${fixed === 1 ? 'violation has' : 'violations have'} been fixed - run 'ngcompass baseline prune' to tighten the baseline`;

  if (onStale === 'error') {
    reporter.error(new Error(message));
    return true;
  }

  reporter.info(`❯ ${message}`);
  return false;
}

function countFixed(staleEntries: ReadonlyArray<StaleEntry>): number {
  let total = 0;
  for (const entry of staleEntries) {
    total += entry.recorded - entry.found;
  }
  return total;
}

function pluralizeFile(count: number): string {
  return count === 1 ? 'file' : 'files';
}

export function describeBaselineError(error: BaselineError): string {
  switch (error.kind) {
    case 'BaselineNotFound':
      return `Baseline is enabled but no baseline file was found at ${error.path}. Run 'ngcompass baseline create' to record the current violations.`;
    case 'BaselineUnreadable':
      return `Baseline file at ${error.path} could not be read: ${error.cause}`;
    case 'BaselineMalformed':
      return `Baseline file at ${error.path} is malformed: ${error.detail}`;
    case 'BaselineVersionUnsupported':
      return `Baseline file at ${error.path} uses format version ${error.found}, but this version of ngcompass supports version ${error.supported}. Upgrade ngcompass or regenerate the baseline.`;
    case 'BaselineWriteFailed':
      return `Baseline file at ${error.path} could not be written: ${error.cause}`;
  }
}
