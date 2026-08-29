export type FileType =
  | 'component'
  | 'directive'
  | 'pipe'
  | 'service'
  | 'module'
  | 'guard'
  | 'logic'
  | 'angular-class'
  | 'spec'
  | 'template'
  | 'style'
  | 'config'
  | 'unknown';

export interface FileInfo {
  readonly path: string;

  readonly type: FileType;

  readonly hash: string;
}

export interface FileInput {
  readonly path: string;

  readonly hash: string;

  readonly needsAst: boolean;
}

export type ResourceType = 'typescript' | 'template' | 'styles' | 'spec';
