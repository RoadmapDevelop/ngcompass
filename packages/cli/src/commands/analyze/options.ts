import type { NormalizedAnalyzerConfig } from '@ngcompass/common';
import type { ReporterFormat } from '@ngcompass/reporters';

export interface EffectivePerformanceOptions {
  maxWorkers: number;
}

export interface AnalyzeOptions {
  profile?: string;
  force?: boolean;
  debug?: boolean;
  format?: ReporterFormat;
  compact?: boolean;
  quiet?: boolean;
  recommendation?: boolean;
  rule?: string;
  output?: string;
  maxWorkers?: string;
  skipTypeCheck?: boolean;
}

export function parsePositiveIntegerOption(
  value: string | undefined,
  optionName: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

export function resolvePerformanceOptions(
  options: AnalyzeOptions,
  config: Pick<NormalizedAnalyzerConfig, 'maxWorkers'>
): EffectivePerformanceOptions {
  const cliMaxWorkers = parsePositiveIntegerOption(
    options.maxWorkers,
    '--max-workers'
  );

  return {
    maxWorkers: cliMaxWorkers ?? config.maxWorkers,
  };
}
