export type InfrastructureErrorType =
  | 'ParseError'
  | 'IOError'
  | 'WorkerCrash'
  | 'CacheCorruption'
  | 'SerializationError'
  | 'RuleExecutionError';

export interface InfrastructureError {
  readonly type: InfrastructureErrorType;
  readonly filePath?: string;
  readonly cause: string;
  readonly timestamp: number;
  readonly recoverable: boolean;
  readonly phase: 'config' | 'planner' | 'engine';
  readonly details?: Readonly<Record<string, unknown>>;
}
