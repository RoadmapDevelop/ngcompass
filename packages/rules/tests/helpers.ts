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
