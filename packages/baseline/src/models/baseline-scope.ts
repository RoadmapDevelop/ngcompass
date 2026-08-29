export interface BaselineScope {
  readonly files: ReadonlySet<string>;
  readonly rules: ReadonlySet<string>;
}
