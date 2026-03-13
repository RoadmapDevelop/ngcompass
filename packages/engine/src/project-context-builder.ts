/**
 * Project Context Builder  (CTX-001 · CTX-002)
 *
 * Constructs the shared, read-only `ProjectContext` once per analysis run by
 * walking the TypeScript `Program` that already exists for type-aware rules.
 * No extra file I/O or parsing is needed — the import graph is derived purely
 * from the compiler's already-resolved module graph.
 *
 * Algorithm: O(F + E) where F = project files, E = import edges.
 *
 * CTX-001 — forward/reverse import graph, component graph, projectFiles, rootDir.
 * CTX-002 — dynamic import() handling, barrel file detection, external deps map.
 *
 * Called by `createTypeAwareAnalysisContext()` immediately after the
 * `ts.Program` is created and stored on the context so that every subsequent
 * `RuleContextFactory.build()` call can attach it to `RuleContext.project`.
 */

import ts from 'typescript';
import * as path from 'node:path';
import { debug } from '@ngcompass/common';
import type { ProjectContext, ComponentFiles, NgModuleInfo } from '@ngcompass/common';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a `ProjectContext` from the TypeScript compiler program.
 *
 * @param program        - The `ts.Program` created for type-aware analysis.
 * @param files          - All files discovered by the scanner (absolute or
 *                         relative to `rootDir`).  Used to seed `projectFiles`
 *                         and to restrict import-graph edges to intra-project
 *                         imports only (external packages are tracked separately
 *                         in `externalDeps`).
 * @param rootDir        - Absolute path to the project root.
 * @param componentFiles - Optional component → template/style/spec cluster map
 *                         (populated by CTX-003 from ComponentDependencyGraph).
 *                         Defaults to an empty map when not provided.
 * @returns              An immutable `ProjectContext` ready to be injected into
 *                       `RuleContext.project`.
 */
export function buildProjectContext(
    program: ts.Program,
    files: ReadonlyArray<string>,
    rootDir: string,
    componentFiles?: ReadonlyMap<string, ComponentFiles>,
): ProjectContext {
    const start = performance.now();

    // ── 1. Normalise all known project files to absolute paths ───────────────
    const projectFileSet = buildProjectFileSet(files, rootDir, program);

    // ── 2. Build forward/reverse import graphs + external dep map ────────────
    const { importGraph, reverseImportGraph, externalDeps } = buildImportGraphs(
        program,
        projectFileSet,
    );

    // ── 3. Detect barrel files ───────────────────────────────────────────────
    const barrelFiles = detectBarrelFiles(program, projectFileSet);

    // ── 4. CTX-003: Build component ↔ template/style/spec cluster maps ───────
    //    Use the caller-supplied map when provided (e.g. from the planner's
    //    ComponentDependencyGraph); otherwise auto-detect from file names.
    const componentGraph = componentFiles ?? buildComponentGraph(projectFileSet);
    const templateToComponent = buildTemplateToComponentMap(componentGraph);

    // ── 5. CTX-004: Scan Angular decorators for NgModule / standalone info ───
    const { ngModuleMap, standaloneComponents, classToFile } =
        buildNgModuleMap(program, projectFileSet);

    const edgeCount = countEdges(importGraph);
    debug(
        'engine',
        `ProjectContext built in ${(performance.now() - start).toFixed(2)}ms` +
        ` — ${projectFileSet.size} files, ${edgeCount} import edges,` +
        ` ${barrelFiles.size} barrels, ${externalDeps.size} files with ext deps,` +
        ` ${componentGraph.size} components, ${templateToComponent.size} template↔component links,` +
        ` ${ngModuleMap.size} NgModules/standalone, ${standaloneComponents.size} standalone`,
    );

    // ── 6. Assemble the context ───────────────────────────────────────────────
    return {
        importGraph:        importGraph        as ReadonlyMap<string, ReadonlySet<string>>,
        reverseImportGraph: reverseImportGraph as ReadonlyMap<string, ReadonlySet<string>>,
        // CTX-004
        ngModuleMap:          ngModuleMap          as ReadonlyMap<string, NgModuleInfo>,
        standaloneComponents: standaloneComponents as ReadonlySet<string>,
        classToFile:          classToFile          as ReadonlyMap<string, string>,
        componentGraph: componentGraph as ReadonlyMap<string, ComponentFiles>,
        projectFiles:   projectFileSet,
        rootDir,
        // CTX-002
        barrelFiles:  barrelFiles  as ReadonlySet<string>,
        externalDeps: externalDeps as ReadonlyMap<string, ReadonlySet<string>>,
        // CTX-003
        templateToComponent: templateToComponent as ReadonlyMap<string, string>,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the canonical set of absolute, normalised project file paths.
 *
 * Seeds come from two sources:
 *  1. The `files` array passed by the scanner (may be relative).
 *  2. Any non-declaration source file inside `rootDir` that the TypeScript
 *     Program knows about (catches files pulled in via `/// <reference>` or
 *     transitive includes not enumerated by the scanner).
 */
function buildProjectFileSet(
    files: ReadonlyArray<string>,
    rootDir: string,
    program: ts.Program,
): Set<string> {
    const set = new Set<string>();

    // Scanner-discovered files
    for (const f of files) {
        set.add(path.resolve(rootDir, f));
    }

    // TypeScript Program source files within the project root
    // (excludes node_modules declaration files)
    const normRoot = normaliseDir(rootDir);
    for (const sf of program.getSourceFiles()) {
        if (!sf.isDeclarationFile && sf.fileName.startsWith(normRoot)) {
            set.add(sf.fileName);
        }
    }

    return set;
}

/**
 * Resolves the TypeScript compiler options' module resolution host once and
 * walks every in-project source file's AST to collect all module specifiers
 * (static imports/re-exports AND dynamic `import()` expressions).
 *
 * For each specifier:
 *   - If it resolves to a project file  → forward + reverse import-graph edge.
 *   - If it is an external package specifier → entry in `externalDeps`.
 *
 * Only intra-project imports are recorded in the import graphs; external
 * packages (node_modules) are captured separately in `externalDeps`.
 */
function buildImportGraphs(
    program: ts.Program,
    projectFileSet: Set<string>,
): {
    importGraph: Map<string, Set<string>>;
    reverseImportGraph: Map<string, Set<string>>;
    externalDeps: Map<string, Set<string>>;
} {
    const compilerOptions   = program.getCompilerOptions();
    const importGraph        = new Map<string, Set<string>>();
    const reverseImportGraph = new Map<string, Set<string>>();
    const externalDeps       = new Map<string, Set<string>>();

    // Pre-seed every project file so rules can safely do:
    //   `importGraph.get(filePath) ?? emptySet`
    for (const file of projectFileSet) {
        importGraph.set(file, new Set());
        reverseImportGraph.set(file, new Set());
    }

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        if (!projectFileSet.has(sourceFile.fileName)) continue;

        const fromFile = sourceFile.fileName;

        // Collect ALL module specifiers — static imports/re-exports + dynamic import()
        const moduleSpecifiers = collectModuleSpecifiers(sourceFile);

        for (const specifier of moduleSpecifiers) {

            // Resolve the module specifier to an absolute file path using the
            // same algorithm the compiler used when building the Program.
            const resolved = ts.resolveModuleName(
                specifier,
                fromFile,
                compilerOptions,
                ts.sys,
            );

            const toFile = resolved.resolvedModule?.resolvedFileName;

            if (toFile && projectFileSet.has(toFile)) {
                // ── Intra-project edge ────────────────────────────────────────
                importGraph.get(fromFile)!.add(toFile);

                // Reverse edge: toFile ← fromFile
                let reverseSet = reverseImportGraph.get(toFile);
                if (!reverseSet) {
                    // File pulled in by the TS program but not the scanner;
                    // add it defensively.
                    reverseSet = new Set();
                    reverseImportGraph.set(toFile, reverseSet);
                }
                reverseSet.add(fromFile);

            } else {
                // ── External or unresolved specifier ─────────────────────────
                const pkgName = extractPackageName(specifier);
                if (pkgName) {
                    let extSet = externalDeps.get(fromFile);
                    if (!extSet) {
                        extSet = new Set();
                        externalDeps.set(fromFile, extSet);
                    }
                    extSet.add(pkgName);
                }
            }
        }
    }

    return { importGraph, reverseImportGraph, externalDeps };
}

/**
 * Identifies barrel files in the project.
 *
 * A file is a barrel if **every** top-level statement is an
 * `export … from '…'` re-export declaration.  Zero-statement files are
 * excluded (empty files are not meaningful barrels).
 *
 * Common examples:
 *   ```ts
 *   // index.ts
 *   export { Foo } from './foo';
 *   export * from './bar';
 *   ```
 *
 * Files with any regular `import`, class/function/variable declaration, or
 * side-effect-only code are **not** treated as barrels.
 */
function detectBarrelFiles(
    program: ts.Program,
    projectFileSet: Set<string>,
): Set<string> {
    const barrelFiles = new Set<string>();

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        if (!projectFileSet.has(sourceFile.fileName)) continue;

        const { statements } = sourceFile;

        // Must have at least one statement to be a meaningful barrel
        if (statements.length === 0) continue;

        // Every statement must be an export-from declaration (re-export)
        const isBarrel = statements.every(
            (stmt) =>
                ts.isExportDeclaration(stmt) &&
                stmt.moduleSpecifier != null,
        );

        if (isBarrel) {
            barrelFiles.add(sourceFile.fileName);
        }
    }

    return barrelFiles;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE SPECIFIER COLLECTION  (CTX-002: full AST walk)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collects **all** module specifier strings from a source file.
 *
 * Handles:
 *   - `import … from 'specifier'`          (static import)
 *   - `export … from 'specifier'`          (re-export / barrel)
 *   - `export * from 'specifier'`          (namespace re-export)
 *   - `import('specifier')`               (dynamic import — CTX-002)
 *
 * Uses a full depth-first AST walk (`ts.forEachChild`) so that dynamic
 * imports inside function bodies, class methods, arrow functions, and
 * conditional branches are all captured.
 *
 * Static import/export declarations terminate recursion early (their children
 * cannot contain further module specifiers), which keeps the hot-path fast.
 */
function collectModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
    const specifiers: string[] = [];

    function visit(node: ts.Node): void {
        // ── Static: import … from 'specifier' ────────────────────────────────
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            specifiers.push(node.moduleSpecifier.text);
            return; // no meaningful children to recurse into
        }

        // ── Static: export { X } from 'specifier'  /  export * from '…' ─────
        if (
            ts.isExportDeclaration(node) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            specifiers.push(node.moduleSpecifier.text);
            return; // no meaningful children to recurse into
        }

        // ── Dynamic: import('specifier') ──────────────────────────────────────
        // TypeScript represents dynamic import as a CallExpression whose
        // callee is the `import` keyword token.
        if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length > 0 &&
            ts.isStringLiteralLike(node.arguments[0])
        ) {
            specifiers.push((node.arguments[0] as ts.StringLiteralLike).text);
            // Continue recursing — the rest of the call args may contain
            // further nested dynamic imports (edge case but possible).
        }

        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
    return specifiers;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL PACKAGE NAME EXTRACTION  (CTX-002)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the bare npm package name from a module specifier.
 *
 * Returns `null` for:
 *   - Relative specifiers (`'./foo'`, `'../bar'`)
 *   - Absolute paths (`'/usr/lib/foo'`)
 *
 * Examples:
 *   `'rxjs/operators'`           → `'rxjs'`
 *   `'@angular/core'`            → `'@angular/core'`
 *   `'@angular/core/rxjs-interop'` → `'@angular/core'`
 *   `'lodash'`                   → `'lodash'`
 *   `'./local'`                  → `null`
 */
function extractPackageName(specifier: string): string | null {
    // Relative or absolute — not an external package
    if (specifier.startsWith('.') || path.isAbsolute(specifier)) return null;

    if (specifier.startsWith('@')) {
        // Scoped package: @scope/name[/subpath]
        // Find the slash after the scope (skip the leading '@')
        const scopeSlash = specifier.indexOf('/', 1);
        if (scopeSlash === -1) return null; // malformed scoped specifier

        // Find the next slash after the package name, if any
        const nameSlash = specifier.indexOf('/', scopeSlash + 1);
        return nameSlash === -1
            ? specifier                        // '@scope/name'
            : specifier.slice(0, nameSlash);  // '@scope/name' from '@scope/name/subpath'
    }

    // Unscoped package: name[/subpath]
    const slash = specifier.indexOf('/');
    return slash === -1 ? specifier : specifier.slice(0, slash);
}

// ─────────────────────────────────────────────────────────────────────────────
// MISC UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Counts total edges in a forward-import-graph map (for debug logging). */
function countEdges(graph: Map<string, Set<string>>): number {
    let n = 0;
    for (const s of graph.values()) n += s.size;
    return n;
}

/**
 * Ensures the root-dir string ends with the platform path separator so that
 * `startsWith(normRoot)` never produces false positives on path-prefix collisions
 * (e.g. `/home/user/project-ext` falsely matching `/home/user/project`).
 */
function normaliseDir(dir: string): string {
    return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

// ─────────────────────────────────────────────────────────────────────────────
// CTX-003: COMPONENT GRAPH DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the component → associated files cluster map from the project file
 * set using Angular naming conventions.
 *
 * Detection rule: a file whose name ends with `.component.ts` is treated as a
 * component class.  Its siblings are discovered by looking for files with the
 * same base name (minus the `.ts` extension) and one of the following suffixes:
 *   - `.html`                 → external template
 *   - `.scss`, `.sass`, `.css`, `.less` → style files
 *   - `.spec.ts`              → test spec
 *
 * All paths in the returned map are absolute.  Only files actually present in
 * `projectFileSet` are recorded — no stat() calls are made.
 *
 * Note: components using inline `template: '…'` will appear in the map with
 * `templatePath: undefined`; callers should handle that case by checking
 * `getTemplate(tsPath)` directly.
 */
function buildComponentGraph(projectFileSet: Set<string>): Map<string, ComponentFiles> {
    const graph = new Map<string, ComponentFiles>();
    const styleExts = ['.scss', '.sass', '.css', '.less'];

    for (const file of projectFileSet) {
        if (!file.endsWith('.component.ts')) continue;

        const dir  = path.dirname(file);
        // e.g. 'foo.component' (strips the trailing '.ts')
        const base = path.basename(file, '.ts');

        // External template: foo.component.html
        const htmlPath = path.join(dir, base + '.html');
        const templatePath = projectFileSet.has(htmlPath) ? htmlPath : undefined;

        // Style files: foo.component.{scss,sass,css,less}
        const stylePaths: string[] = [];
        for (const ext of styleExts) {
            const stylePath = path.join(dir, base + ext);
            if (projectFileSet.has(stylePath)) stylePaths.push(stylePath);
        }

        // Spec: foo.component.spec.ts
        const specCandidate = path.join(dir, base + '.spec.ts');
        const specPath = projectFileSet.has(specCandidate) ? specCandidate : undefined;

        graph.set(file, { tsPath: file, templatePath, stylePaths, specPath });
    }

    return graph;
}

/**
 * Inverts the component graph so template rules can do an O(1) lookup of
 * "which component owns this template file?".
 *
 * Only external templates (with an explicit `templatePath`) appear in the
 * reverse map.  Inline templates are reachable via `componentGraph` keyed on
 * the component `.ts` path itself.
 */
function buildTemplateToComponentMap(
    componentGraph: ReadonlyMap<string, ComponentFiles>,
): Map<string, string> {
    const map = new Map<string, string>();
    for (const [tsPath, cluster] of componentGraph) {
        if (cluster.templatePath) {
            map.set(cluster.templatePath, tsPath);
        }
    }
    return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// CTX-004: ANGULAR DECORATOR SCANNER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans every TypeScript source file in the project for Angular decorator
 * metadata and returns three correlated data structures:
 *
 *  - `ngModuleMap`          — `@NgModule` and standalone `@Component` entries
 *  - `standaloneComponents` — absolute paths of all standalone Angular entities
 *  - `classToFile`          — exported class name → absolute file path resolver
 *
 * Algorithm: two passes over the program's source files, both O(F × D) where
 * F = project files, D = average decorators per class (typically 1–2).
 *
 * Pass 1: Build `classToFile` from exported class declarations.
 * Pass 2: Scan decorators; build `ngModuleMap` and `standaloneComponents`.
 *
 * Decorator aliases (e.g. `import { NgModule as NG }`) are not resolved —
 * the raw identifier text is matched.  This covers 99%+ of real-world Angular
 * projects that use the standard import names.
 */
function buildNgModuleMap(
    program: ts.Program,
    projectFileSet: Set<string>,
): {
    ngModuleMap:          Map<string, NgModuleInfo>;
    standaloneComponents: Set<string>;
    classToFile:          Map<string, string>;
} {
    const ngModuleMap          = new Map<string, NgModuleInfo>();
    const standaloneComponents = new Set<string>();
    const classToFile          = buildClassToFileMap(program, projectFileSet);

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        if (!projectFileSet.has(sourceFile.fileName)) continue;

        for (const statement of sourceFile.statements) {
            if (!ts.isClassDeclaration(statement)) continue;

            const decorators = ts.canHaveDecorators(statement)
                ? ts.getDecorators(statement)
                : undefined;
            if (!decorators?.length) continue;

            for (const decorator of decorators) {
                const info = getDecoratorCallInfo(decorator);
                if (!info) continue;

                const { name, arg } = info;

                if (name === 'NgModule') {
                    if (arg) {
                        ngModuleMap.set(sourceFile.fileName, {
                            filePath:     sourceFile.fileName,
                            declarations: new Set(extractArrayElements(arg, 'declarations')),
                            imports:      new Set(extractArrayElements(arg, 'imports')),
                            exports:      new Set(extractArrayElements(arg, 'exports')),
                            providers:    new Set(extractArrayElements(arg, 'providers')),
                            isStandalone: false,
                        });
                    }
                    break; // only one @NgModule per file expected
                }

                if (name === 'Component') {
                    const isStandalone = arg ? extractBoolProp(arg, 'standalone') : false;
                    if (isStandalone) {
                        standaloneComponents.add(sourceFile.fileName);
                        ngModuleMap.set(sourceFile.fileName, {
                            filePath:     sourceFile.fileName,
                            declarations: new Set<string>(),
                            imports:      new Set(arg ? extractArrayElements(arg, 'imports') : []),
                            exports:      new Set<string>(),
                            providers:    new Set(arg ? extractArrayElements(arg, 'providers') : []),
                            isStandalone: true,
                        });
                    }
                    break;
                }

                if (name === 'Directive' || name === 'Pipe') {
                    if (arg && extractBoolProp(arg, 'standalone')) {
                        standaloneComponents.add(sourceFile.fileName);
                    }
                    break;
                }
            }
        }
    }

    return { ngModuleMap, standaloneComponents, classToFile };
}

/**
 * Builds a map of every **exported** class name to the absolute path of the
 * file that declares it.
 *
 * Only `export class Foo { … }` declarations are indexed — re-exported names
 * from barrel files are not followed (that would require resolving the full
 * import graph which is already available separately via `importGraph`).
 */
function buildClassToFileMap(
    program: ts.Program,
    projectFileSet: Set<string>,
): Map<string, string> {
    const map = new Map<string, string>();

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        if (!projectFileSet.has(sourceFile.fileName)) continue;

        for (const statement of sourceFile.statements) {
            if (!ts.isClassDeclaration(statement) || !statement.name) continue;

            const mods = ts.canHaveModifiers(statement)
                ? ts.getModifiers(statement)
                : undefined;
            const isExported = mods?.some(
                (m) => m.kind === ts.SyntaxKind.ExportKeyword,
            );
            if (!isExported) continue;

            map.set(statement.name.text, sourceFile.fileName);
        }
    }

    return map;
}

/**
 * Extracts the decorator name and its first object-literal argument from a
 * `ts.Decorator` node.
 *
 * Returns `undefined` for non-call decorators (`@injectable` without `()`) or
 * decorators whose callee is not a plain identifier (e.g. `@ns.Decorator()`).
 */
function getDecoratorCallInfo(
    decorator: ts.Decorator,
): { name: string; arg: ts.ObjectLiteralExpression | undefined } | undefined {
    const expr = decorator.expression;
    if (!ts.isCallExpression(expr)) return undefined;

    const callee = expr.expression;
    if (!ts.isIdentifier(callee)) return undefined;

    const firstArg = expr.arguments[0];
    const arg = firstArg && ts.isObjectLiteralExpression(firstArg)
        ? firstArg
        : undefined;

    return { name: callee.text, arg };
}

/**
 * Extracts class-name strings from an array property of a decorator object
 * literal, e.g. the `declarations` array of `@NgModule({ declarations: [...] })`.
 *
 * Handles three element forms:
 *   - `Identifier`            → the identifier's text (e.g. `FooComponent`)
 *   - `PropertyAccessExpression` → the root identifier (e.g. `RouterModule` from
 *                                   `RouterModule.forChild(...)`)
 *   - `CallExpression`        → the callee (e.g. `ModuleWithProviders` call)
 *
 * Spread elements (`...sharedImports`) are skipped — they cannot be statically
 * resolved without evaluating the referenced variable.
 */
function extractArrayElements(
    arg: ts.ObjectLiteralExpression,
    propName: string,
): string[] {
    for (const prop of arg.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (!ts.isIdentifier(prop.name) || prop.name.text !== propName) continue;

        const init = prop.initializer;
        if (!ts.isArrayLiteralExpression(init)) return [];

        const names: string[] = [];
        for (const el of init.elements) {
            names.push(...extractClassNameFromExpression(el));
        }
        return names;
    }
    return [];
}

/**
 * Recursively extracts the root identifier name from an Angular decorator
 * array element.
 *
 * Angular allows three forms in `declarations` / `imports` / `exports`:
 *   1. `FooComponent`                    → `['FooComponent']`
 *   2. `RouterModule.forChild(routes)`   → `['RouterModule']`
 *   3. `provideRouter(routes)`           → `['provideRouter']`
 *   4. `...sharedImports`                → `[]` (spread, not statically resolved)
 */
function extractClassNameFromExpression(node: ts.Expression): string[] {
    if (ts.isIdentifier(node)) return [node.text];
    if (ts.isPropertyAccessExpression(node)) {
        return extractClassNameFromExpression(node.expression);
    }
    if (ts.isCallExpression(node)) {
        return extractClassNameFromExpression(node.expression);
    }
    return [];
}

/**
 * Reads a boolean property from a decorator object literal.
 *
 * Returns `true` only when the property is explicitly set to the `true`
 * keyword literal.  Missing properties and non-literal values (e.g.
 * `standalone: someConst`) return `false`.
 */
function extractBoolProp(
    arg: ts.ObjectLiteralExpression,
    propName: string,
): boolean {
    for (const prop of arg.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (!ts.isIdentifier(prop.name) || prop.name.text !== propName) continue;
        return prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// STABLE EMPTY SENTINELS
// ─────────────────────────────────────────────────────────────────────────────

