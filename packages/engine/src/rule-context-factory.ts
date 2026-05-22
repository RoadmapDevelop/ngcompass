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
        let templateFilePath: string | undefined;
        let templateFileContent: string | undefined;
        let templateLocator: Locator | undefined;
        if (needsTemplate) {
            template = await this.context.getTemplate(filePath);
        }

        const project: ProjectContext | undefined =
            this.context.getProjectContext?.();

        if (needsTemplate && !template && project) {
            templateFilePath = this.resolveExternalTemplatePath(filePath, project);
            if (templateFilePath) {
                template = await this.context.getTemplate(templateFilePath);
                templateFileContent = await this.context.readFile(templateFilePath);
                templateLocator = new Locator(templateFileContent);
            }
        }

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
            templateFilePath,
            templateFileContent,
            templateLocator,
            options,
            project,
            crossRef,
        };
    }

    // ── Cross-Reference Helpers ──────────────────────────────────────────────

    /**
     * Builds a `ComponentCrossRef` for the given file path when that file is
     * either a `.component.ts` class or its associated template.
     *
     * Returns `undefined` for all other file types.
     */
    private resolveExternalTemplatePath(
        filePath: string,
        project: ProjectContext,
    ): string | undefined {
        const componentPath = filePath.endsWith('.component.ts')
            ? filePath
            : project.templateToComponent.get(filePath);

        if (!componentPath) return undefined;
        return project.componentGraph.get(componentPath)?.templatePath;
    }

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
        let signalMembers: ReadonlySet<string> | undefined;
        try {
            const tsSourceFile = await this.getComponentSourceFile(componentPath);
            if (tsSourceFile) {
                publicMembers = extractPublicMembers(tsSourceFile);
                signalMembers = extractSignalMembers(tsSourceFile);
            }
        } catch {
            // Best-effort: skip when extraction fails (e.g., malformed AST).
        }

        // Resolve the template to extract references.
        // Priority: the already-loaded inline template > external templatePath.
        // For components with `templateUrl`, the runner loads the .html file separately
        // as a task but `loadedTemplate` here is the result of parsing the .ts file,
        // which contains no inline template → undefined.  We fall back to loading the
        // external file explicitly so template-reference-aware rules work on both
        // inline and external templates.
        let effectiveTemplate = loadedTemplate;
        if (!effectiveTemplate && templatePath) {
            try {
                effectiveTemplate = await this.context.getTemplate(templatePath);
            } catch {
                // Best-effort: external template missing or unreadable.
            }
        }

        let templateReferences: ReadonlySet<string> | undefined;
        if (effectiveTemplate) {
            try {
                templateReferences = extractTemplateReferences(effectiveTemplate);
            } catch {
                // Best-effort: skip when reference extraction fails.
            }
        }

        return { componentPath, templatePath, stylePaths, specPath, publicMembers, signalMembers, templateReferences };
    }

    private async getComponentSourceFile(componentPath: string): Promise<ts.SourceFile | undefined> {
        const existing = this.context.getTsSourceFile?.(componentPath);
        if (existing) return existing;

        const source = await this.context.readFile(componentPath);
        return ts.createSourceFile(componentPath, source, ts.ScriptTarget.Latest, true);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC AST EXTRACTION HELPERS
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

const SIGNAL_FACTORY_NAMES = new Set([
    'signal',
    'computed',
    'linkedSignal',
    'input',
    'model',
    'toSignal',
]);

function getSignalFactoryName(expr: ts.Expression): string | undefined {
    const unwrapped = ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)
        ? expr.expression
        : expr;

    if (!ts.isCallExpression(unwrapped)) return undefined;

    const callee = unwrapped.expression;
    if (ts.isIdentifier(callee)) return callee.text;

    if (ts.isPropertyAccessExpression(callee)) {
        if (ts.isIdentifier(callee.expression) && callee.expression.text === 'input') {
            return 'input';
        }
        return callee.name.text;
    }

    return undefined;
}

function extractSignalMembers(sourceFile: ts.SourceFile): ReadonlySet<string> {
    const members = new Set<string>();

    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement)) continue;

        for (const member of statement.members) {
            if (!ts.isPropertyDeclaration(member) || !member.initializer) continue;
            if (!member.name || ts.isPrivateIdentifier(member.name)) continue;

            const factoryName = getSignalFactoryName(member.initializer);
            if (!factoryName || !SIGNAL_FACTORY_NAMES.has(factoryName)) continue;

            if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
                members.add(member.name.text);
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

        // angular-html-parser represents ALL Angular bindings as raw { name, value }
        // objects in `attrs`.  Event-binding attrs (name begins with `(`, e.g.
        // `(click)="handler()"`) are intentionally skipped: identifiers inside event
        // handlers are used imperatively and do not represent template-consumed state
        // (e.g. `(click)="refresh$.next()"` must not add `refresh$` to the refs set).
        if (Array.isArray(n['attrs'])) {
            for (const attr of n['attrs'] as unknown[]) {
                const a = attr as Record<string, unknown>;
                const attrName = typeof a['name'] === 'string' ? a['name'] : '';
                if (attrName.startsWith('(')) continue; // skip event bindings
                const value = a['value'];
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
            while ((m = INTERPOLATION_RE.exec(n['value'])) !== null) {
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

