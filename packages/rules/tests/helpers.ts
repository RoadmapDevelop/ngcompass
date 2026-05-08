/**
 * Shared Test Helpers for Rules Unit Tests
 *
 * Provides a lightweight `RuleContext` factory based on real `parseTs` AST output.
 * Rules call `rule.handle(node, ctx)` — these helpers construct both pieces.
 */

import { Locator } from '@ngcompass/common';
import { parseTs } from '@ngcompass/ast';
import type { RuleContext } from '@ngcompass/common';
import type { Program } from 'oxc-parser';

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

export function makeContext(
    source: string,
    filePath = '/src/test.component.ts',
): RuleContext & { program: Program } {
    const { program } = parseTs(source, filePath);
    return {
        filePath,
        fileContent: source,
        // Some rules access sourceText via (context as any).sourceText for import
        // alias detection (collectRxjsAliases). Aliasing fileContent here ensures
        // those rules receive source text in both fields without duplicating it.
        sourceText: source,
        locator: new Locator(source),
        program,
    } as any;
}

// ---------------------------------------------------------------------------
// Node walkers — collect all AST nodes matching a predicate
// ---------------------------------------------------------------------------

export function findNodes(program: Program, predicate: (n: any) => boolean): any[] {
    const results: any[] = [];
    const stack: any[] = [program];
    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (predicate(node)) results.push(node);
        for (const val of Object.values(node)) {
            if (Array.isArray(val)) stack.push(...val);
            else if (val && typeof val === 'object') stack.push(val);
        }
    }
    return results;
}

export function findCallExpressions(program: Program, callee?: string): any[] {
    return findNodes(program, (n) => {
        if (n.type !== 'CallExpression') return false;
        if (!callee) return true;
        // Identifier direct call: foo()
        if (n.callee?.type === 'Identifier' && n.callee.name === callee) return true;
        // Member expression: obj.foo()
        if (
            (n.callee?.type === 'StaticMemberExpression' || n.callee?.type === 'MemberExpression') &&
            n.callee?.property?.name === callee
        ) return true;
        return false;
    });
}

// ---------------------------------------------------------------------------
// Angular class node factory  (for AnyAngularClass / AngularClass stream rules)
// ---------------------------------------------------------------------------

const ANGULAR_DECORATOR_NAMES = new Set(['Component', 'Directive', 'Pipe', 'Injectable', 'NgModule']);

/**
 * Extracts the Angular decorator name from a ClassDeclaration AST node.
 *
 * Strategy (in order):
 * 1. Read the actual `@Decorator` from the parsed AST.
 * 2. Fall back to filename convention (`.component.ts` → 'Component', etc.)
 * 3. Return 'Unknown' so rules that guard on 'Component'/'Directive' correctly
 *    skip unrecognised file types in tests.
 */
function extractDecoratorName(classNode: any, filePath: string): string {
    // 1. Try to read from AST decorators
    const decorators = classNode.decorators;
    if (Array.isArray(decorators)) {
        for (const d of decorators) {
            const expr = d.expression ?? d;
            if (expr?.type === 'Identifier' && ANGULAR_DECORATOR_NAMES.has(expr.name)) return expr.name;
            if (expr?.type === 'CallExpression') {
                const callee = expr.callee;
                if (callee?.type === 'Identifier' && ANGULAR_DECORATOR_NAMES.has(callee.name)) return callee.name;
            }
        }
    }
    // 2. Fall back to filename convention
    if (filePath.endsWith('.component.ts')) return 'Component';
    if (filePath.endsWith('.directive.ts')) return 'Directive';
    if (filePath.endsWith('.pipe.ts')) return 'Pipe';
    if (filePath.endsWith('.service.ts')) return 'Injectable';
    if (filePath.endsWith('.module.ts')) return 'NgModule';
    if (filePath.endsWith('.guard.ts')) return 'Injectable';
    // 3. Unrecognised — rules guarding on 'Component'/'Directive' will return null
    return 'Unknown';
}

/**
 * Parses `source` and returns the first ClassDeclaration node wrapped in the
 * minimal `AnyAngularClassNode`-compatible shape expected by Angular class rules.
 *
 * All `AnyAngularClass` stream rules do:
 *   const classNode = streamNode.node as unknown as AstNode;
 *   const classBody = getClassBody(classNode);
 *
 * Wrapping the parsed ClassDeclaration as `{ node, metadata, decoratorName }`
 * satisfies that contract without requiring the full engine streaming
 * infrastructure.
 *
 * For rules that additionally inspect `streamNode.metadata` (e.g. prefer-on-push),
 * pass `metadata` explicitly:
 *
 *   const { classStreamNode, ctx } = makeAngularClassNode(src, '/src/a.component.ts', {
 *     type: 'Component',
 *     changeDetection: { kind: 'missing' },
 *     className: 'MyComponent',
 *   });
 */
export function makeAngularClassNode(
    source: string,
    filePath = '/src/test.component.ts',
    metadata: Record<string, unknown> = {},
): { classStreamNode: any; ctx: RuleContext & { program: Program } } {
    const ctx = makeContext(source, filePath);
    const classNodes = findNodes(ctx.program, (n: any) => n.type === 'ClassDeclaration');
    if (!classNodes.length) {
        throw new Error(
            `makeAngularClassNode: no ClassDeclaration found in source:\n${source.slice(0, 200)}`
        );
    }
    // Populate `decoratorName` so rules that guard on classNodeWrapper.decoratorName
    // (e.g. signal-prefer-input-signal, prefer-after-render-over-after-view-init)
    // receive the correct value in unit tests.
    const decoratorName = (metadata.decoratorName as string | undefined)
        ?? extractDecoratorName(classNodes[0], filePath);
    const classStreamNode = { node: classNodes[0], metadata, decoratorName };
    return { classStreamNode, ctx };
}
