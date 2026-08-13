import type { ConfigIssue } from '@ngcompass/common';

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
