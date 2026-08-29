import type { CacheContext } from '@ngcompass/cache';

export interface ConfigDiscoveryResult {
  config: unknown;
  filepath: string;
  content: string;
  contentHash: string;
  isEmpty?: boolean;
}

export interface ValidateConfigOptions {
  cwd: string;

  profile?: string;

  cache?: CacheContext;
}
