import type { CacheContext } from '@ngcompass/cache';
import type {
  InfrastructureErrorCollector,
  ParserOptions,
} from '@ngcompass/common';
import type { AnalysisFileProgress } from './progress.js';

export interface AnalysisOptions {
  readonly rootDir: string;

  readonly cache?: CacheContext;

  readonly debug?: boolean;

  readonly maxWorkers?: number;

  readonly parallelThreshold?: number;

  readonly errorCollector?: InfrastructureErrorCollector;

  readonly files?: ReadonlyArray<string>;

  readonly parserOptions?: ParserOptions;

  readonly typeAwareFileConcurrency?: number;

  readonly typeAwarePerFileTimeoutMs?: number;

  readonly skipTypeCheck?: boolean;

  readonly onProgress?: (completed: number, total: number) => void;

  readonly onFileProgress?: (event: AnalysisFileProgress) => void;

  readonly onNotice?: (message: string) => void;

  readonly onFileSkipped?: (filePath: string) => void;
}
