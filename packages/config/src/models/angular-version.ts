export type AngularVersionSource =
  | 'config'
  | 'installed'
  | 'declared'
  | 'unknown';

export interface AngularVersionDetection {
  readonly version: string | null;
  readonly source: AngularVersionSource;
  readonly reason?: string;
}
