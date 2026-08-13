import type { MetadataValue } from './metadata-value.js';

export const ChangeDetectionStrategy = {
  Default: 0,
  OnPush: 1,
} as const;

export type ChangeDetectionStrategy =
  (typeof ChangeDetectionStrategy)[keyof typeof ChangeDetectionStrategy];

export interface HostDirectiveMetadata {
  readonly directive: string | undefined;
  readonly inputs: ReadonlyArray<{
    readonly internal: string;
    readonly external: string;
  }>;
  readonly outputs: ReadonlyArray<{
    readonly internal: string;
    readonly external: string;
  }>;
}

export interface ComponentMetadata {
  readonly className: string | undefined;
  readonly selector: MetadataValue<string>;
  readonly changeDetection: MetadataValue<ChangeDetectionStrategy>;
  readonly standalone: MetadataValue<boolean>;
  readonly templateUrl: MetadataValue<string>;
  readonly template: MetadataValue<string>;
  readonly hostDirectives: MetadataValue<ReadonlyArray<HostDirectiveMetadata>>;
  readonly decoratorStart: number;
  readonly type: 'Component' | 'Directive';
}
