import path from 'node:path';
import ts from 'typescript';
import {
  debug,
  type AngularTypeIndex,
  type ParserOptions,
  type ProjectContext,
} from '@ngcompass/common';
import { createAnalysisContext } from './analysis-context.js';
import type {
  TypeAwareAnalysisContext,
  TypeAwareAnalysisContextOptions,
} from './models/index.js';
import { buildProjectContext } from './project-context-builder.js';
import { createAngularTypeIndex } from './angular-type-index.js';

export function createTypeAwareAnalysisContext(
  rootDir: string,
  files: ReadonlyArray<string> = [],
  parserOptions?: ParserOptions,
  contextOptions: TypeAwareAnalysisContextOptions = {}
): TypeAwareAnalysisContext {
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
    logProgramDiagnostics(program, performance.now() - tsStart);
  } else {
    debug(
      'engine',
      'Could not find tsconfig.json; TypeChecker and ProjectContext will be unavailable.'
    );
  }

  let typeChecker = program?.getTypeChecker();
  if (typeChecker) installTypeMemoization(typeChecker);
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
    getTsProgram: (): ts.Program | undefined => activeProgram,
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
}

export function isTsProgramRoot(filePath: string): boolean {
  return (
    (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) &&
    !filePath.endsWith('.d.ts')
  );
}

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

  const compilerOptions: ts.CompilerOptions = {
    ...parsedCommandLine.options,
    ...HARDENED_COMPILER_OPTIONS,
  };

  const program = ts.createProgram({
    rootNames: programRoots,
    options: compilerOptions,
    host: createCachedCompilerHost(compilerOptions),
  });

  debug(
    'engine',
    `Program rootNames: ${programRoots.length} (tsconfig had ${parsedCommandLine.fileNames.length})`
  );
  return { program };
}

const HARDENED_COMPILER_OPTIONS: ts.CompilerOptions = {
  skipLibCheck: true,
  skipDefaultLibCheck: true,
  noEmit: true,
  declaration: false,
  declarationMap: false,
  sourceMap: false,
  inlineSourceMap: false,
  incremental: false,
  composite: false,
};

function createCachedCompilerHost(
  options: ts.CompilerOptions
): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true);
  const resolutionCache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    (fileName) => host.getCanonicalFileName(fileName),
    options
  );

  host.resolveModuleNameLiterals = (
    moduleLiterals,
    containingFile,
    redirectedReference,
    resolutionOptions
  ): readonly ts.ResolvedModuleWithFailedLookupLocations[] =>
    moduleLiterals.map((literal) =>
      ts.resolveModuleName(
        literal.text,
        containingFile,
        resolutionOptions,
        host,
        resolutionCache,
        redirectedReference
      )
    );

  return host;
}

function installTypeMemoization(typeChecker: ts.TypeChecker): void {
  const typeCache = new WeakMap<ts.Node, ts.Type>();
  const resolveType = typeChecker.getTypeAtLocation.bind(typeChecker);

  typeChecker.getTypeAtLocation = (node: ts.Node): ts.Type => {
    const cached = typeCache.get(node);
    if (cached) return cached;
    const resolved = resolveType(node);
    typeCache.set(node, resolved);
    return resolved;
  };
}

const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;

function logProgramDiagnostics(program: ts.Program, elapsedMs: number): void {
  let libFiles = 0;
  let projectFiles = 0;
  for (const sourceFile of program.getSourceFiles()) {
    if (
      sourceFile.isDeclarationFile ||
      NODE_MODULES_RE.test(sourceFile.fileName)
    ) {
      libFiles++;
    } else {
      projectFiles++;
    }
  }

  const heapUsedMb = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(0);
  debug(
    'engine',
    `Program diagnostics: ${projectFiles} project file(s), ${libFiles} lib/declaration file(s), ` +
      `built in ${elapsedMs.toFixed(0)}ms, heapUsed ${heapUsedMb}MB`
  );
}
