export interface InitOptions {
  cwd?: string;
  force?: boolean;
}

export interface ConfigTemplateOptions {
  readonly include?: ReadonlyArray<string>;
  readonly exclude?: ReadonlyArray<string>;
}
