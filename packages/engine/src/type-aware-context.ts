/**
 * Type-Aware Analysis Context
 *
 * Instantiates a TypeScript Program across the entire project for type-aware rules.
 * This is an expensive operation and should only be used on the main thread for
 * rules that explicitly declare `needsTypeChecker: true` or `projectContext: true`.
 *
 * CTX-001: Also builds the `ProjectContext` (import graph, component cluster map,
 * project file set) as a zero-cost by-product of the already-created ts.Program.
 * The context is computed once and served to every rule via `getProjectContext()`.
 */

import ts from "typescript";
import { createAnalysisContext, type AnalysisContext } from "./analysis-context.js";
import { buildProjectContext } from "./project-context-builder.js";
import { debug } from "@ngcompass/common";
import type { ProjectContext } from "@ngcompass/common";

/**
 * Extends the baseline AnalysisContext to include:
 *  - Full TypeScript semantic analysis via `getTypeChecker`
 *  - Project-wide cross-file metadata via `getProjectContext`  (CTX-001)
 *  - Direct TypeScript SourceFile access via `getTsSourceFile` (CTX-003)
 */
export interface TypeAwareAnalysisContext extends AnalysisContext {
    readonly getTypeChecker: (filePath: string) => Promise<ts.TypeChecker | undefined>;
    /**
     * Returns the pre-built `ProjectContext` for the current analysis run.
     *
     * The same object is returned on every call — it is computed once when the
     * context is created and never mutated.  Returns `undefined` when no
     * `tsconfig.json` was found and the TypeScript Program could not be created.
     */
    readonly getProjectContext: () => ProjectContext | undefined;
    /**
     * Returns the `ts.SourceFile` for the given absolute file path from the
     * already-created `ts.Program`, or `undefined` if the file is not part of
     * the program (e.g. a non-TypeScript resource file).
     *
     * Used by `RuleContextFactory` (CTX-003) to extract `publicMembers` from a
     * component class without reparsing.  Zero extra I/O — the SourceFile is
     * already held in memory by the Program.
     */
    readonly getTsSourceFile: (filePath: string) => ts.SourceFile | undefined;
}

/**
 * Creates an AnalysisContext that also includes a global TypeScript program
 * and the project-wide `ProjectContext`.
 *
 * NOTE: `ts.createProgram` is synchronous and can be very heavy on large
 * codebases.  This should be invoked exactly once per run.
 *
 * @param rootDir - Absolute path to the project root.
 * @param files   - All files discovered by the scanner (used to seed
 *                  `ProjectContext.projectFiles` and restrict import-graph
 *                  edges to intra-project imports).  Defaults to `[]` for
 *                  backward compatibility with existing call sites.
 */
export const createTypeAwareAnalysisContext = (
    rootDir: string,
    files: ReadonlyArray<string> = [],
): TypeAwareAnalysisContext => {
    // 1. Setup baseline context (Oxc AST, templates, styles, memoized file reads)
    const baseContext = createAnalysisContext(rootDir);

    debug('engine', 'Initializing Type-Aware Context (ts.createProgram)...');
    const tsStart = performance.now();

    // 2. Discover tsconfig.json
    const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, "tsconfig.json");

    let program: ts.Program | undefined;

    if (configPath) {
        // Parse the config file
        const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
        const parsedCommandLine = ts.parseJsonConfigFileContent(
            configFile.config,
            ts.sys,
            rootDir
        );

        // 3. Create the global TypeScript Program
        program = ts.createProgram({
            rootNames: parsedCommandLine.fileNames,
            options: parsedCommandLine.options,
        });

        debug(
            'engine',
            `TypeScript Program initialized in ${(performance.now() - tsStart).toFixed(2)}ms` +
            ` with ${parsedCommandLine.fileNames.length} files`,
        );
    } else {
        debug('engine', 'Could not find tsconfig.json; TypeChecker and ProjectContext will be unavailable.');
    }

    const typeChecker = program?.getTypeChecker();

    // 4. Build ProjectContext (CTX-001) — free by-product of the existing Program.
    //    Uses the scanner-discovered `files` list to restrict the graph to
    //    intra-project imports; external packages are excluded automatically.
    let projectContext: ProjectContext | undefined;
    if (program) {
        try {
            projectContext = buildProjectContext(program, files, rootDir);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            debug('engine', `ProjectContext build failed (non-fatal): ${msg}`);
            // Non-fatal: rules that need project context receive `undefined`
            // and must degrade gracefully (see RuleAstRequirements.projectContext).
        }
    }

    // 5. Return the augmented context
    return {
        ...baseContext,
        getTypeChecker: async (_filePath: string): Promise<ts.TypeChecker | undefined> => {
            return typeChecker;
        },
        getProjectContext: (): ProjectContext | undefined => {
            return projectContext;
        },
        // CTX-003: Expose the ts.SourceFile so RuleContextFactory can extract
        // public members from a component class without extra I/O.
        getTsSourceFile: (filePath: string): ts.SourceFile | undefined => {
            return program?.getSourceFile(filePath);
        },
    };
};
