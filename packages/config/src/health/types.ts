import { z } from 'zod';
import type { ConfigIssue } from '@ngcompass/common';
import { AnalyzerConfigSchema } from '../schemas/schema.js';

export type ValidatedConfig = z.infer<typeof AnalyzerConfigSchema>;

export type CacheConfig = ValidatedConfig['cache'];

export interface ValidationContext {
  profile?: string;

  cwd: string;
  fs: {
    existsSync: (path: string) => boolean;
    accessSync: (path: string, mode: number) => void;
  };
  os: {
    cpus: () => Array<{ model: string }>;
  };
  path: {
    dirname: (p: string) => string;
    resolve: (...paths: string[]) => string;
    isAbsolute: (p: string) => boolean;
  };
}

export interface ConfigBlock {
  maxWorkers?: number;
  angularVersion?: string | null;
  cache?:
    | boolean
    | {
        readonly enabled?: boolean;
        readonly location?: string;
        readonly strategy?: 'memory' | 'local';
        readonly ttl?: number;
      };
}

export interface ConfigBlockValidation {
  issues: ConfigIssue[];
}

export type WritableIssue = {
  -readonly [K in keyof ConfigIssue]: ConfigIssue[K];
};
