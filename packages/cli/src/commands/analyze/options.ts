import type { NormalizedAnalyzerConfig } from '@ngcompass/common';
import type { ReporterFormat } from '@ngcompass/reporters';

export type PerformanceMode = 'eco' | 'balanced' | 'turbo';

export interface PerformanceModeOptions {
  typeAwareFileConcurrency: number;
}

export interface EffectivePerformanceOptions extends PerformanceModeOptions {
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
  mode?: string;
  maxWorkers?: string;
  skipTypeCheck?: boolean;
}

const PERFORMANCE_MODE_PRESETS: Readonly<
  Record<PerformanceMode, PerformanceModeOptions>
> = {
  eco: {
    typeAwareFileConcurrency: 1,
  },
  balanced: {
    typeAwareFileConcurrency: 1,
  },
  turbo: {
    typeAwareFileConcurrency: 4,
  },
};

const PERFORMANCE_MODES: readonly PerformanceMode[] = [
  'eco',
  'balanced',
  'turbo',
];
const PERFORMANCE_MODE_VALUES = new Set<string>(PERFORMANCE_MODES);

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

function isPerformanceMode(value: string): value is PerformanceMode {
  return PERFORMANCE_MODE_VALUES.has(value);
}

function parsePerformanceMode(value: string | undefined): PerformanceMode {
  const mode = value ?? 'balanced';
  if (!isPerformanceMode(mode)) {
    throw new Error(
      `Invalid performance mode "${mode}". Expected one of: ${PERFORMANCE_MODES.join(', ')}.`
    );
  }

  return mode;
}

export function resolvePerformanceOptions(
  options: AnalyzeOptions,
  config: Pick<NormalizedAnalyzerConfig, 'maxWorkers'>
): EffectivePerformanceOptions {
  const mode = parsePerformanceMode(options.mode);
  const preset = PERFORMANCE_MODE_PRESETS[mode];
  const cliMaxWorkers = parsePositiveIntegerOption(
    options.maxWorkers,
    '--max-workers'
  );

  return {
    maxWorkers: cliMaxWorkers ?? config.maxWorkers,
    typeAwareFileConcurrency: preset.typeAwareFileConcurrency,
  };
}
