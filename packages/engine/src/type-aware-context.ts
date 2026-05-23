/**
 * @fileoverview
 * Type-aware analysis context — extends the baseline {@link AnalysisContext}
 * with a TypeScript `Program`, a `TypeChecker`, and a pre-built
 * `ProjectContext`.
 *
 * These resources are expensive to create (a `ts.createProgram` over a
 * monorepo can take seconds and several hundred MB), so this module is
 * invoked once per type-aware *chunk* on the main thread. The orchestrator
 * disposes the context after every chunk to release the program before the
 * next chunk allocates its own.
 */

import path from 'node:path';
import ts from 'typescript';
import { debug, type ParserOptions, type ProjectContext } from '@ngcompass/common';
import { createAnalysisContext, type AnalysisContext } from './analysis-context.js';
import { buildProjectContext } from './project-context-builder.js';

/** Extended context that exposes type-aware accessors. */
export interface TypeAwareAnalysisContext extends AnalysisContext {
    /** Returns the `TypeChecker` for the run (single Program → single checker). */
    readonly getTypeChecker: (filePath: string) => Promise<ts.TypeChecker | undefined>;
    /** Returns the pre-built, immutable `ProjectContext` for the run. */
    readonly getProjectContext: () => ProjectContext | undefined;
    /** Returns the TypeScript `SourceFile` corresponding to `filePath`, if loaded. */
    readonly getTsSourceFile: (filePath: string) => ts.SourceFile | undefined;
    /**
     * Eagerly warms the context. Currently a no-op apart from a debug log —
     * the constructor already creates the Program. Kept for API parity with
     * sibling context factories that may have async warmup needs.
     */
    readonly warmup: () => Promise<void>;
    /** Drops references to the Program, TypeChecker, ProjectContext, and base caches. */
    readonly dispose: () => void;
}

/** Optional flags accepted by {@link createTypeAwareAnalysisContext}. */
export interface TypeAwareAnalysisContextOptions {
    /** When `false`, skips `ProjectContext` construction. Defaults to `true`. */
    readonly buildProjectContext?: boolean;
    /** Explicit list of root files for the TS Program (overrides `files`). */
    readonly programRootFiles?: ReadonlyArray<string>;
}

/**
 * Builds a {@link TypeAwareAnalysisContext} rooted at `rootDir`.
 *
 * Tries to find a `tsconfig.json` (honoring `parserOptions.project` /
 * `parserOptions.tsconfigRootDir` when supplied). When no tsconfig is found
 * the context still functions — the `TypeChecker` and `ProjectContext`
 * accessors simply return `undefined`.
 *
 * @param rootDir         - Project root used for tsconfig discovery.
 * @param files           - Scanner-discovered files; forwarded to the
 *                          `ProjectContext` builder.
 * @param parserOptions   - Optional TypeScript parser overrides from config.
 * @param contextOptions  - Flags controlling Program / context construction.
 */
export const createTypeAwareAnalysisContext = (
    rootDir: string,
    files: ReadonlyArray<string> = [],
    parserOptions?: ParserOptions,
    contextOptions: TypeAwareAnalysisContextOptions = {},
): TypeAwareAnalysisContext => {
    const baseContext = createAnalysisContext(rootDir);

    debug('engine', 'Initializing Type-Aware Context (ts.createProgram)...');
    const tsStart = performance.now();

    const { program } = loadTypeScriptProgram(rootDir, files, parserOptions, contextOptions);

    if (program) {
        debug(
            'engine',
            `TypeScript Program ready in ${(performance.now() - tsStart).toFixed(2)}ms ` +
            `(${program.getSourceFiles().length} source files)`,
        );
    } else {
        debug('engine', 'Could not find tsconfig.json; TypeChecker and ProjectContext will be unavailable.');
    }

    let typeChecker = program?.getTypeChecker();
    let projectContext: ProjectContext | undefined;

    if (program && contextOptions.buildProjectContext !== false) {
        try {
            projectContext = buildProjectContext(program, files, rootDir);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            debug('engine', `ProjectContext build failed (non-fatal): ${msg}`);
        }
    } else if (program) {
        debug('engine', 'Skipping ProjectContext build for type-checker-only chunk');
    }

    let activeProgram = program;

    return {
        ...baseContext,
        // `getTypeChecker` is declared `async` for API stability — some
        // callers `await` the result. Resolving synchronously here keeps the
        // call-site shape unchanged without extra microtask cost.
        getTypeChecker: (_filePath: string): Promise<ts.TypeChecker | undefined> =>
            Promise.resolve(typeChecker),
        getProjectContext: (): ProjectContext | undefined => projectContext,
        getTsSourceFile: (filePath: string): ts.SourceFile | undefined =>
            activeProgram?.getSourceFile(filePath),

        warmup: (): Promise<void> => {
            debug(
                'engine',
                `Type-aware context ready: ${activeProgram
                    ? `ts.Program with ${activeProgram.getSourceFiles().length} source files`
                    : 'no tsconfig found, TypeChecker unavailable'}`,
            );
            return Promise.resolve();
        },
        dispose: (): void => {
            projectContext = undefined;
            typeChecker = undefined;
            activeProgram = undefined;
            baseContext.dispose();
        },
    };
};

// ── Internal helpers ──────────────────────────────────────────────────────

/** Predicate for files that can serve as roots of a TS Program. */
export const isTsProgramRoot = (filePath: string): boolean =>
    (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) && !filePath.endsWith('.d.ts');

/**
 * Locates a `tsconfig.json`, parses it, and builds a `ts.Program` rooted at
 * the supplied file list. Returns `{ program: undefined }` when no tsconfig
 * is found.
 */
function loadTypeScriptProgram(
    rootDir: string,
    files: ReadonlyArray<string>,
    parserOptions: ParserOptions | undefined,
    contextOptions: TypeAwareAnalysisContextOptions,
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
        tsconfigRootDir,
    );

    // Use only the files we are actually analyzing as TS Program roots.
    // The full tsconfig.fileNames for a monorepo can be 10 000+ files
    // (test, demo, tool packages) whose ASTs we never need — loading them
    // all blows the heap. TypeScript still resolves every import
    // transitively, so type accuracy is unaffected.
    const candidateRootFiles = contextOptions.programRootFiles ?? files;
    const tsFileRoots = candidateRootFiles.filter(isTsProgramRoot);
    const programRoots = tsFileRoots.length > 0 ? tsFileRoots : parsedCommandLine.fileNames;

    const program = ts.createProgram({
        rootNames: programRoots,
        options: parsedCommandLine.options,
    });

    debug(
        'engine',
        `Program rootNames: ${programRoots.length} (tsconfig had ${parsedCommandLine.fileNames.length})`,
    );
    return { program };
}
