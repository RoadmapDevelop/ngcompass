/**
 * @fileoverview
 * Provides the RuleContextFactory for initializing rule execution contexts.
 *
 * This component is responsible for aggregating various analytical artifacts—including
 * file content, AST structures, type information, and project metadata—into a
 * unified RuleContext suitable for rule evaluation.
 */

import { Locator, RuleContext, TemplateAst, StyleAst, ProjectContext, ComponentCrossRef } from '@ngcompass/common';
import { Program } from 'oxc-parser';
import ts, { TypeChecker } from 'typescript';

/**
 * Defines the operational boundaries for context construction.
 * Encapsulates resource access requirements for both main-thread and worker-thread execution.
 */
export interface ExecutionContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<Program>;
    readonly getTypeChecker?: (filePath: string) => Promise<TypeChecker | undefined>;
    readonly getTemplate: (filePath: string) => Promise<TemplateAst | undefined>;
    readonly getStyle: (filePath: string) => Promise<StyleAst | undefined>;
    /**
     * Retrieves the project-wide analytical context, if available.
     */
    readonly getProjectContext?: () => ProjectContext | undefined;
    /**
     * Retrieves the TypeScript SourceFile representation for a given path.
     */
    readonly getTsSourceFile?: (filePath: string) => ts.SourceFile | undefined;
}

// ============================================
// FACTORY CLASS
// ============================================

/**
 * Orschestrates the assembly of fully-resolved RuleContext objects.
 *
 * Decouples the rule execution logic from the underlying storage and retrieval
 * mechanisms by utilizing the ExecutionContext abstraction.
 */
export class RuleContextFactory {
    constructor(private readonly context: ExecutionContext) { }

    /**
     * Builds a RuleContext for the given file.
     *
     * @param filePath      - Absolute path to the file being analysed
     * @param options       - Rule-specific options from the configuration
     * @param needsTemplate - Whether the rule(s) in this batch require the template
     * @returns A fully resolved RuleContext
     */
    async build(
        filePath: string,
        options: Record<string, unknown>,
        needsTemplate: boolean,
    ): Promise<RuleContext> {
        const [fileContent, program] = await Promise.all([
            this.context.readFile(filePath),
            this.context.getProgram(filePath),
        ]);

        const locator = new Locator(fileContent);

        let typeChecker: import('typescript').TypeChecker | undefined;
        if (this.context.getTypeChecker) {
            typeChecker = await this.context.getTypeChecker(filePath);
        }

        let template: TemplateAst | undefined;
        if (needsTemplate) {
            template = await this.context.getTemplate(filePath);
        }

        const project: ProjectContext | undefined =
            this.context.getProjectContext?.();

        const crossRef = project
            ? await this.buildCrossRef(filePath, template, project)
            : undefined;

        return {
            filePath,
            fileContent,
            locator,
            program,
            typeChecker,
            template,
            options,
            project,
            crossRef,
        };
    }

    // ── CTX-003: Cross-Reference Helpers ─────────────────────────────────────

    /**
     * Builds a `ComponentCrossRef` for the given file path when that file is
     * either a `.component.ts` class or its associated template.
     *
     * Returns `undefined` for all other file types.
     */
    private async buildCrossRef(
        filePath: string,
        loadedTemplate: TemplateAst | undefined,
        project: ProjectContext,
    ): Promise<ComponentCrossRef | undefined> {
        const isComponent = filePath.endsWith('.component.ts');

        const componentPath = isComponent
            ? filePath
            : project.templateToComponent.get(filePath);

        if (!componentPath) return undefined;

        const cluster = project.componentGraph.get(componentPath);

        const templatePath = cluster?.templatePath;
        const stylePaths = cluster?.stylePaths ?? [];
        const specPath = cluster?.specPath;

        let publicMembers: ReadonlySet<string> | undefined;
        const tsSourceFile = this.context.getTsSourceFile?.(componentPath);
        if (tsSourceFile) {
            try {
                publicMembers = extractPublicMembers(tsSourceFile);
            } catch {
            }
        }

        let templateReferences: ReadonlySet<string> | undefined;
        if (loadedTemplate) {
            try {
                templateReferences = extractTemplateReferences(loadedTemplate);
            } catch {
            }
        }

        return { componentPath, templatePath, stylePaths, specPath, publicMembers, templateReferences };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CTX-003: STATIC AST EXTRACTION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the names of all **public** members (properties and methods)
 * declared directly in a TypeScript class inside the given `SourceFile`.
 *
 * Members excluded:
 *   - Those with `private` or `protected` modifiers.
 *   - TypeScript `#private` identifiers.
 *   - Accessors (getters / setters) are included under their property name.
 *
 * All class declarations in the file are walked; in practice a component file
 * has exactly one class, so this is effectively O(N) on the number of members.
 */
function extractPublicMembers(sourceFile: ts.SourceFile): ReadonlySet<string> {
    const members = new Set<string>();

    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement)) continue;

        for (const member of statement.members) {
            const mods = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
            if (mods) {
                const isPrivateOrProtected = mods.some(
                    (m) =>
                        m.kind === ts.SyntaxKind.PrivateKeyword ||
                        m.kind === ts.SyntaxKind.ProtectedKeyword,
                );
                if (isPrivateOrProtected) continue;
            }

            const name = member.name;
            if (!name) continue;

            if (ts.isPrivateIdentifier(name)) continue;

            if (ts.isIdentifier(name)) {
                members.add(name.text);
            } else if (ts.isStringLiteral(name)) {
                members.add(name.text);
            }
        }
    }

    return members;
}

/**
 * Regex that matches valid Angular/JS identifier characters, including `$`
 * which is conventional for Observable properties (e.g. `loading$`).
 * Anchored with word boundaries so it doesn't match mid-word substrings.
 *
 * We intentionally cast a wide net here — non-member names (pipe names, Angular
 * keywords, method args) will appear in the set but are harmless because callers
 * only look up specific class-member names that are known to exist.
 */
const TEMPLATE_IDENT_RE = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;

/**
 * Extracts all identifiers from an Angular expression string.
 *
 * Used to pull identifiers out of raw attribute values produced by
 * `angular-html-parser`, which stores ALL binding syntaxes
 * (`[prop]="expr"`, `(event)="handler"`, `*ngIf="expr"`) as plain
 * `{ name, value }` attribute objects rather than parsed expression AST nodes.
 */
function extractIdentifiersFromExprString(expr: string, refs: Set<string>): void {
    TEMPLATE_IDENT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TEMPLATE_IDENT_RE.exec(expr)) !== null) {
        refs.add(match[1]);
    }
}

/**
 * Extracts the set of identifiers referenced anywhere in the template.
 *
 * `angular-html-parser` (the HTML parser used here) returns a *raw* AST in
 * which every attribute — property bindings `[prop]="…"`, event bindings
 * `(event)="…"`, and structural directives `*ngIf="…"` — is stored as a
 * plain `{ name: string; value: string }` object inside the `attrs` array.
 * No parsed sub-expression AST is attached.
 *
 * Text interpolations (`{{ expr }}`) are carried as the raw string value of
 * `Text` nodes (e.g. `"Hello {{ name }}!"`).
 *
 * This function handles both cases by:
 *   1. Scanning each attribute's raw `value` string for identifiers.
 *   2. Scanning `Text` node `value` strings for `{{ … }}` interpolations
 *      and extracting identifiers from each interpolation expression.
 *   3. Recursing into `children`.
 *
 * The resulting set intentionally includes pipe names, Angular keywords, and
 * local template variables — callers are responsible for filtering to
 * class-member names of interest.
 */
function extractTemplateReferences(templateAst: TemplateAst): ReadonlySet<string> {
    const refs = new Set<string>();

    /** Interpolation pattern: {{ ... }} */
    const INTERPOLATION_RE = /\{\{([\s\S]*?)\}\}/g;

    function walkNode(node: unknown): void {
        if (!node || typeof node !== 'object') return;
        const n = node as Record<string, unknown>;

        // angular-html-parser represents ALL Angular bindings ([prop], (event),
        // *dir, plain attributes) as raw { name, value } objects in `attrs`.
        if (Array.isArray(n['attrs'])) {
            for (const attr of n['attrs'] as unknown[]) {
                const value = (attr as Record<string, unknown>)['value'];
                if (typeof value === 'string' && value) {
                    extractIdentifiersFromExprString(value, refs);
                }
            }
        }

        // Text nodes carry their content as a plain string (e.g. "Hello {{ name }}!").
        // Extract identifiers from each {{ … }} interpolation found in the text.
        if (typeof n['value'] === 'string' && n['value']) {
            INTERPOLATION_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = INTERPOLATION_RE.exec(n['value'] as string)) !== null) {
                extractIdentifiersFromExprString(m[1], refs);
            }
        }

        // Recurse into child nodes.
        if (Array.isArray(n['children'])) {
            for (const child of n['children'] as unknown[]) {
                walkNode(child);
            }
        }
    }

    for (const node of templateAst.rootNodes) {
        walkNode(node);
    }

    return refs;
}

