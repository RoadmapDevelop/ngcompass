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
  baseline?: string | boolean;
  output?: string;
  maxWorkers?: string;
  skipTypeCheck?: boolean;
}
