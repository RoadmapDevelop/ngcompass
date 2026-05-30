import path from 'node:path';
import type {
  AnalysisResult,
  NormalizedAnalyzerConfig,
  ParserOptions,
} from '@ngcompass/common';
import type { ReporterFormat } from '@ngcompass/reporters';

export function normalizeReporterFormat(
  format: ReporterFormat | undefined
): ReporterFormat {
  if (format === 'ui') return 'html';
  return format ?? 'console';
}

export function resolveReporterFormat(
  cliFormat: ReporterFormat | undefined,
  configFormat: NormalizedAnalyzerConfig['outputFormat'] | undefined
): ReporterFormat {
  if (cliFormat) {
    return normalizeReporterFormat(cliFormat);
  }

  switch (configFormat) {
    case 'json':
      return 'json';
    case 'sarif':
      return 'sarif';
    case 'html':
      return 'html';
    case 'text':
    case undefined:
      return 'console';
    default:
      return 'console';
  }
}

export function shouldFailAnalysis(
  config: Pick<NormalizedAnalyzerConfig, 'failOnSeverity' | 'maxWarnings'>,
  stats: Pick<AnalysisResult['stats'], 'totalErrors' | 'totalWarnings'>
): boolean {
  const failOnSeverity = config.failOnSeverity ?? 'error';
  const maxWarnings = config.maxWarnings ?? 10;

  if (stats.totalErrors > 0) {
    return true;
  }

  if (failOnSeverity === 'warn' && stats.totalWarnings > 0) {
    return true;
  }

  return stats.totalWarnings > maxWarnings;
}

export function resolveParserProjectPath(
  parserOptions: ParserOptions | undefined,
  cwd: string
): string | undefined {
  if (!parserOptions?.project) {
    return undefined;
  }

  const rootDir = parserOptions.tsconfigRootDir
    ? path.resolve(cwd, parserOptions.tsconfigRootDir)
    : cwd;

  return path.resolve(rootDir, parserOptions.project);
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function formatAnalysisProgressMessage(
  completed: number,
  total: number
): string {
  return `Running analysis: ${completed.toLocaleString()}/${total.toLocaleString()} checks complete...`;
}
