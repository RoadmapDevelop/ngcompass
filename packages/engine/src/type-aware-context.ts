import path from 'node:path';
import ts from 'typescript';
import {
  debug,
  type AngularTypeIndex,
  type ParserOptions,
  type ProjectContext,
} from '@ngcompass/common';
import {
  createAnalysisContext,
  type AnalysisContext,
} from './analysis-context.js';
import { buildProjectContext } from './project-context-builder.js';
import { createAngularTypeIndex } from './angular-type-index.js';

export interface TypeAwareAnalysisContext extends AnalysisContext {
  readonly getTypeChecker: (
    filePath: string
  ) => Promise<ts.TypeChecker | undefined>;

  readonly getProjectContext: () => ProjectContext | undefined;

  readonly getTsSourceFile: (filePath: string) => ts.SourceFile | undefined;

  readonly getAngularTypes: () => AngularTypeIndex | undefined;

  readonly warmup: () => Promise<void>;

  readonly dispose: () => void;
}

export interface TypeAwareAnalysisContextOptions {
  readonly buildProjectContext?: boolean;

  readonly programRootFiles?: ReadonlyArray<string>;
}

export const createTypeAwareAnalysisContext = (
  rootDir: string,
  files: ReadonlyArray<string> = [],
  parserOptions?: ParserOptions,
  contextOptions: TypeAwareAnalysisContextOptions = {}
): TypeAwareAnalysisContext => {
  const baseContext = createAnalysisContext(rootDir);

  debug('engine', 'Initializing Type-Aware Context (ts.createProgram)...');
  const tsStart = performance.now();

  const { program } = loadTypeScriptProgram(
    rootDir,
    files,
    parserOptions,
    contextOptions
  );

  if (program) {
    debug(
      'engine',
      `TypeScript Program ready in ${(performance.now() - tsStart).toFixed(2)}ms ` +
        `(${program.getSourceFiles().length} source files)`
    );
  } else {
    debug(
      'engine',
      'Could not find tsconfig.json; TypeChecker and ProjectContext will be unavailable.'
    );
  }

  let typeChecker = program?.getTypeChecker();
  let projectContext: ProjectContext | undefined;
  let angularTypes: AngularTypeIndex | undefined =
    createAngularTypeIndex(program);

  if (program && contextOptions.buildProjectContext !== false) {
    try {
      projectContext = buildProjectContext(program, files, rootDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debug('engine', `ProjectContext build failed (non-fatal): ${msg}`);
    }
  } else if (program) {
    debug(
      'engine',
      'Skipping ProjectContext build for type-checker-only chunk'
    );
  }

  let activeProgram = program;

  return {
    ...baseContext,

    getTypeChecker: (_filePath: string): Promise<ts.TypeChecker | undefined> =>
      Promise.resolve(typeChecker),
    getProjectContext: (): ProjectContext | undefined => projectContext,
    getTsSourceFile: (filePath: string): ts.SourceFile | undefined =>
      activeProgram?.getSourceFile(filePath),
    getAngularTypes: (): AngularTypeIndex | undefined => angularTypes,

    warmup: (): Promise<void> => {
      debug(
        'engine',
        `Type-aware context ready: ${
          activeProgram
            ? `ts.Program with ${activeProgram.getSourceFiles().length} source files`
            : 'no tsconfig found, TypeChecker unavailable'
        }`
      );
      return Promise.resolve();
    },
    dispose: (): void => {
      projectContext = undefined;
      typeChecker = undefined;
      angularTypes = undefined;
      activeProgram = undefined;
      baseContext.dispose();
    },
  };
};

export const isTsProgramRoot = (filePath: string): boolean =>
  (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) &&
  !filePath.endsWith('.d.ts');

function loadTypeScriptProgram(
  rootDir: string,
  files: ReadonlyArray<string>,
  parserOptions: ParserOptions | undefined,
  contextOptions: TypeAwareAnalysisContextOptions
): { program: ts.Program | undefined } {
  const tsconfigRootDir = parserOptions?.tsconfigRootDir
    ? path.resolve(rootDir, parserOptions.tsconfigRootDir)
    : rootDir;

  const configPath = parserOptions?.project
    ? path.resolve(tsconfigRootDir, parserOptions.project)
    : ts.findConfigFile(tsconfigRootDir, ts.sys.fileExists, 'tsconfig.json');

  if (!configPath) return { program: undefined };

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedCommandLine = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    tsconfigRootDir
  );

  const candidateRootFiles = contextOptions.programRootFiles ?? files;
  const tsFileRoots = candidateRootFiles.filter(isTsProgramRoot);
  const programRoots =
    tsFileRoots.length > 0 ? tsFileRoots : parsedCommandLine.fileNames;

  const program = ts.createProgram({
    rootNames: programRoots,
    options: parsedCommandLine.options,
  });

  debug(
    'engine',
    `Program rootNames: ${programRoots.length} (tsconfig had ${parsedCommandLine.fileNames.length})`
  );
  return { program };
}
