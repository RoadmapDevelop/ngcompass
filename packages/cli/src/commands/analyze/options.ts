import type { NormalizedAnalyzerConfig } from '@ngcompass/common';
import type { ReporterFormat } from '@ngcompass/reporters';

export type PerformanceMode = 'eco' | 'balanced' | 'turbo';

export type TypeAwareIsolation = 'auto' | 'process' | 'off';

export type TypeAwareChunkStrategy = 'dependency' | 'simple';

export interface PerformanceModeOptions {
  typeAwareChunkSize: number;
  typeAwareIsolation: TypeAwareIsolation;
  typeAwareChunkStrategy: TypeAwareChunkStrategy;
  typeAwareConcurrency: number;
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
    typeAwareConcurrency: 1,
    typeAwareFileConcurrency: 1,
    typeAwareChunkSize: 100,
    typeAwareIsolation: 'auto',
    typeAwareChunkStrategy: 'dependency',
  },
  balanced: {
    typeAwareConcurrency: 2,
    typeAwareFileConcurrency: 2,
    typeAwareChunkSize: 300,
    typeAwareIsolation: 'auto',
    typeAwareChunkStrategy: 'simple',
  },
  turbo: {
    typeAwareConcurrency: 2,
    typeAwareFileConcurrency: 4,
    typeAwareChunkSize: 500,
    typeAwareIsolation: 'off',
    typeAwareChunkStrategy: 'simple',
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
    typeAwareChunkSize: preset.typeAwareChunkSize,
    typeAwareConcurrency: preset.typeAwareConcurrency,
    typeAwareFileConcurrency: preset.typeAwareFileConcurrency,
    typeAwareIsolation: preset.typeAwareIsolation,
    typeAwareChunkStrategy: preset.typeAwareChunkStrategy,
  };
}
