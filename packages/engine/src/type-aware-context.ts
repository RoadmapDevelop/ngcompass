/**
 * @fileoverview
 * Provides the TypeAwareAnalysisContext for advanced analytical operations.
 *
 * This module coordinates the initialization of the TypeScript Program and
 * the ProjectContext, enabling semantic analysis and project-wide metadata
 * access. These operations are resource-intensive and are performed once
 * per analysis run on the primary execution thread.
 */
import path from "node:path";
import ts from "typescript";
import { createAnalysisContext, type AnalysisContext } from "./analysis-context.js";
import { buildProjectContext } from "./project-context-builder.js";
import { debug } from "@ngcompass/common";
import type { ParserOptions, ProjectContext } from "@ngcompass/common";

/**
 * Enhances the baseline AnalysisContext with semantic and project-wide data.
 */
export interface TypeAwareAnalysisContext extends AnalysisContext {
    /**
     * Retrieves the TypeScript TypeChecker for semantic analysis.
     */
    readonly getTypeChecker: (filePath: string) => Promise<ts.TypeChecker | undefined>;
    /**
     * Retrieves the pre-built, immutable ProjectContext for the current run.
     */
    readonly getProjectContext: () => ProjectContext | undefined;
    /**
     * Retrieves the TypeScript SourceFile representation for a given path.
     */
    readonly getTsSourceFile: (filePath: string) => ts.SourceFile | undefined;
    /**
     * Performs an explicit initialization phase for type-aware resources.
     */
    readonly warmup: () => Promise<void>;
    /**
     * Releases references to the TypeScript Program, TypeChecker, ProjectContext,
     * and baseline parsed artifacts after a type-aware chunk finishes.
     */
    readonly dispose: () => void;
}

export interface TypeAwareAnalysisContextOptions {
    readonly buildProjectContext?: boolean;
    readonly programRootFiles?: ReadonlyArray<string>;
}

/**
 * Initializes a TypeAwareAnalysisContext for the specified root directory.
 *
 * @param rootDir The absolute path to the project root.
 * @param files A collection of file paths identified during the scanning phase.
 * @returns A fully initialized TypeAwareAnalysisContext instance.
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

    const tsconfigRootDir = parserOptions?.tsconfigRootDir
        ? path.resolve(rootDir, parserOptions.tsconfigRootDir)
        : rootDir;
    const configPath = parserOptions?.project
        ? path.resolve(tsconfigRootDir, parserOptions.project)
        : ts.findConfigFile(tsconfigRootDir, ts.sys.fileExists, "tsconfig.json");

    let program: ts.Program | undefined;

    if (configPath) {
        const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
        const parsedCommandLine = ts.parseJsonConfigFileContent(
            configFile.config,
            ts.sys,
            tsconfigRootDir
        );

        // Use only the files we are actually analyzing as TS Program roots.
        // The full tsconfig.fileNames for a monorepo can be 10,000+ files
        // (test, demo, tool packages) whose ASTs we never need — loading them
        // all blows the heap.  TypeScript still resolves every import
        // transitively, so type accuracy is unaffected.
        const candidateRootFiles = contextOptions.programRootFiles ?? files;
        const tsFileRoots = candidateRootFiles.filter(
            f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts')
        );
        const programRoots = tsFileRoots.length > 0 ? tsFileRoots : parsedCommandLine.fileNames;

        program = ts.createProgram({
            rootNames: programRoots,
            options: parsedCommandLine.options,
        });

        debug(
            'engine',
            `TypeScript Program initialized in ${(performance.now() - tsStart).toFixed(2)}ms` +
            ` with ${programRoots.length} roots (tsconfig had ${parsedCommandLine.fileNames.length})`,
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

    return {
        ...baseContext,

        getTypeChecker: async (_filePath: string): Promise<ts.TypeChecker | undefined> => {
            return typeChecker;
        },
        getProjectContext: (): ProjectContext | undefined => {
            return projectContext;
        },
        getTsSourceFile: (filePath: string): ts.SourceFile | undefined => {
            return program?.getSourceFile(filePath);
        },

        warmup: async (): Promise<void> => {
            debug('engine', `Type-aware context ready: ${program ? `ts.Program with ${program.getSourceFiles().length} source files` : 'no tsconfig found, TypeChecker unavailable'}`);
        },
        dispose: (): void => {
            projectContext = undefined;
            typeChecker = undefined;
            program = undefined;
            baseContext.dispose();
        },
    };
};
