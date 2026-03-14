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
        const stylePaths   = cluster?.stylePaths ?? [];
        const specPath     = cluster?.specPath;

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
 * Extracts the set of component-instance identifiers referenced in the
 * template.  Covers:
 *   - Property reads: `[prop]="value"`, `{{ value }}`
 *   - Method calls: `(click)="handler($event)"`, `[disabled]="isLoading()"`
 *   - Safe navigation: `{{ obj?.prop }}`
 *
 * The extraction is conservative — only identifiers whose implicit receiver
 * is the component instance (i.e. `ImplicitReceiver`, meaning `this.X`) are
 * collected.  A node is treated as having an implicit receiver when its
 * `.receiver` is present but has neither a `.name` nor a nested `.receiver`
 * (the two properties that distinguish real object references from the
 * implicit component `this`).
 *
 * False positives (e.g. `obj.property` where `obj` is a local variable) are
 * rare in Angular templates and are acceptable for the heuristic use-cases
 * this field targets.
 */
function extractTemplateReferences(templateAst: TemplateAst): ReadonlySet<string> {
    const refs = new Set<string>();

    function walkNode(node: unknown): void {
        if (!node || typeof node !== 'object') return;
        const n = node as Record<string, unknown>;

        if (Array.isArray(n['inputs'])) {
            for (const input of n['inputs'] as unknown[]) {
                walkExpression((input as Record<string, unknown>)['value'] ??
                               (input as Record<string, unknown>)['expression']);
            }
        }

        if (Array.isArray(n['outputs'])) {
            for (const output of n['outputs'] as unknown[]) {
                walkExpression((output as Record<string, unknown>)['handler']);
            }
        }

        const val = n['value'];
        if (val && typeof val === 'object') {
            const v = val as Record<string, unknown>;
            if (Array.isArray(v['expressions'])) {
                for (const expr of v['expressions'] as unknown[]) {
                    walkExpression(expr);
                }
            }
        }

        if (n['expression'] && typeof n['expression'] === 'object') {
            walkExpression(n['expression']);
        }

        if (Array.isArray(n['children'])) {
            for (const child of n['children'] as unknown[]) {
                walkNode(child);
            }
        }
    }

    function walkExpression(expr: unknown): void {
        if (!expr || typeof expr !== 'object') return;
        const e = expr as Record<string, unknown>;

        if (typeof e['name'] === 'string' && e['name'].length > 0) {
            const rec = e['receiver'];
            if (rec && typeof rec === 'object') {
                const r = rec as Record<string, unknown>;
                if (!r['name'] && !r['receiver']) {
                    refs.add(e['name'] as string);
                }
            }
        }

        // Recurse into receiver chain
        if (e['receiver']) walkExpression(e['receiver']);

        // Method arguments
        if (Array.isArray(e['args'])) {
            for (const arg of e['args'] as unknown[]) walkExpression(arg);
        }

        // Binary: { left, right }
        if (e['left'])  walkExpression(e['left']);
        if (e['right']) walkExpression(e['right']);

        // Conditional: { condition, trueExp, falseExp }
        if (e['condition']) walkExpression(e['condition']);
        if (e['trueExp'])   walkExpression(e['trueExp']);
        if (e['falseExp'])  walkExpression(e['falseExp']);

        // LiteralArray: { expressions }
        if (Array.isArray(e['expressions'])) {
            for (const sub of e['expressions'] as unknown[]) walkExpression(sub);
        }

        // LiteralMap: { values }
        if (Array.isArray(e['values'])) {
            for (const sub of e['values'] as unknown[]) walkExpression(sub);
        }
    }

    for (const node of templateAst.rootNodes) {
        walkNode(node);
    }

    return refs;
}

