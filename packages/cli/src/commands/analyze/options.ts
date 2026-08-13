import type { NormalizedAnalyzerConfig } from '@ngcompass/common';
import type {
  AnalyzeOptions,
  EffectivePerformanceOptions,
} from '../../models/index.js';
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
