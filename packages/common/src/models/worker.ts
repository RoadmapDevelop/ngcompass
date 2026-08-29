import type { RuleResult } from './rule-result.js';

export interface WorkerTaskError {
  readonly task: { readonly taskId: string };
  readonly error: string;
}

export interface HeapUsage {
  readonly usedBytes: number;
  readonly limitBytes: number;
}

export interface WorkerFileProgress {
  readonly kind: 'file-progress';
  readonly filePath: string;
  readonly taskCount: number;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly duration: number;
  readonly typeAware: boolean;
}

export interface WorkerMessageResult {
  readonly results: RuleResult[];
  readonly errors: WorkerTaskError[];
}
