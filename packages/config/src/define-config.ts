import type { AnalyzerConfig } from '@ngcompass/common';

export function defineConfig<TConfig extends AnalyzerConfig>(
  config: TConfig
): TConfig {
  return config;
}
