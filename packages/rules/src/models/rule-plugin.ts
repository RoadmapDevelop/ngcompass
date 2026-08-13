import type { PluginManifest, RuleMetadata } from '@ngcompass/common';
import type { RuleHandler } from '@ngcompass/engine';

export interface RulePlugin {
  readonly name: string;

  readonly handler: RuleHandler<unknown>;

  readonly meta?: Partial<RuleMetadata>;

  readonly manifest?: PluginManifest;
}

export interface RegisterOptions {
  allowOverride?: boolean;
}
