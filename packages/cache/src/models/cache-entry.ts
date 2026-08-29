export interface SourceEntry {
  content: string;

  filePath: string;
}

export interface AstEntry {
  filePath: string;

  ast: unknown;
}

export interface FileCacheEntry {
  files: string[];

  timestamp: number;

  stats?: unknown;
}

export interface FileMeta {
  readonly mtime: number;
  readonly size: number;
  readonly hash: string;
}

export interface CacheMetadata {
  readonly taskId: string;

  readonly timestamp: number;

  readonly hits: number;

  readonly lastAccess: number;
}

export interface CacheEntry<T> {
  readonly result: T;

  readonly metadata: CacheMetadata;
}
