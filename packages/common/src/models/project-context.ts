export interface ComponentFiles {
  readonly tsPath: string;

  readonly templatePath?: string;

  readonly stylePaths: ReadonlyArray<string>;

  readonly specPath?: string;
}

export interface NgModuleInfo {
  readonly filePath: string;

  readonly declarations: ReadonlySet<string>;

  readonly imports: ReadonlySet<string>;

  readonly exports: ReadonlySet<string>;

  readonly providers: ReadonlySet<string>;

  readonly isStandalone: boolean;
}

export interface ProjectContext {
  readonly importGraph: ReadonlyMap<string, ReadonlySet<string>>;

  readonly reverseImportGraph: ReadonlyMap<string, ReadonlySet<string>>;

  readonly ngModuleMap: ReadonlyMap<string, NgModuleInfo>;

  readonly standaloneComponents: ReadonlySet<string>;

  readonly classToFile: ReadonlyMap<string, string>;

  readonly componentGraph: ReadonlyMap<string, ComponentFiles>;

  readonly projectFiles: ReadonlySet<string>;

  readonly rootDir: string;

  readonly barrelFiles: ReadonlySet<string>;

  readonly externalDeps: ReadonlyMap<string, ReadonlySet<string>>;

  readonly templateToComponent: ReadonlyMap<string, string>;
}

export interface ComponentCrossRef {
  readonly componentPath: string;

  readonly templatePath?: string;

  readonly stylePaths: ReadonlyArray<string>;

  readonly specPath?: string;

  readonly publicMembers?: ReadonlySet<string>;

  readonly signalMembers?: ReadonlySet<string>;

  readonly templateReferences?: ReadonlySet<string>;
}
