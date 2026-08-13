export interface CacheKeyContext {
  readonly toolVersion: string;

  readonly schemaVersion: string;

  readonly ruleRegistryHash: string;

  readonly parserVersion: string;

  readonly platform: string;
}
