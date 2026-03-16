import { TemplateExpressionNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createTemplateExpressionRule } from '@ngcompass/engine';

import { RECOMMENDATIONS } from '../../recommendations';
import {
    AstNode,
    MaybeAstNode,
    childNodes,
    getStaticPropertyName,
    isMemberExpressionLike,
    unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'template-no-call-expression';

const ALLOWED_FREE_CALL_NAMES = new Set([
    'translate',
    '$localize',
]);

const ALLOWED_MEMBER_CALL_NAMES = new Set([
    'slice',
    'toString',
    'toFixed',
    'toUpperCase',
    'toLowerCase',
    'trim',
    'join',
    'includes',
    'indexOf',
    'startsWith',
    'endsWith',
    'charAt',
    'substring',
    'replace',
    'split',
    'concat',
    'toISOString',
    'toLocaleDateString',
    'toLocaleTimeString',
    'toLocaleString',
]);

/**
 * Returns the absolute source offset for the template expression.
 */
function getTemplateAbsoluteOffset(
    context: RuleContext,
    node: TemplateExpressionNode,
): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateStartOffset = (context as any).template?.templateStartOffset;

    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }

    return node.sourceSpan.start;
}

/**
 * Returns true when the node is a call expression.
 */
function isCallExpressionLike(node: MaybeAstNode): boolean {
    const unwrapped = unwrapNode(node);
    return (
        !!unwrapped &&
        (unwrapped.type === 'CallExpression' || unwrapped.type === 'OptionalCallExpression')
    );
}

/**
 * Returns the call arguments array.
 */
function getCallArguments(node: MaybeAstNode): AstNode[] {
    const unwrapped = unwrapNode(node);
    return Array.isArray(unwrapped?.arguments) ? unwrapped.arguments : [];
}

/**
 * Returns true when the call has one or more arguments.
 */
function hasArguments(node: MaybeAstNode): boolean {
    return getCallArguments(node).length > 0;
}

/**
 * Returns the name of the function or method being called.
 */
function getCallName(node: MaybeAstNode): string {
    const unwrapped = unwrapNode(node);
    if (!unwrapped) {
        return '';
    }
    const callee = unwrapNode(unwrapped.callee);
    if (!callee) {
        return '';
    }

    if (callee.type === 'Identifier') {
        return (callee.name as string) ?? '';
    }
    if (isMemberExpressionLike(callee)) {
        return getStaticPropertyName(callee);
    }
    return '';
}

/**
 * Returns true when the call is explicitly allowed.
 *
 * Notes:
 * - Free calls are limited to a small allowlist.
 * - Member calls are allowed only by known method name.
 * - This remains heuristic because receiver type information is unavailable here.
 */
function isAllowedCall(node: MaybeAstNode): boolean {
    const unwrapped = unwrapNode(node);
    if (!unwrapped || !isCallExpressionLike(unwrapped)) {
        return false;
    }

    const callee = unwrapNode(unwrapped.callee);
    if (!callee) {
        return false;
    }

    if (callee.type === 'Identifier') {
        return ALLOWED_FREE_CALL_NAMES.has(callee.name as string);
    }

    if (!isMemberExpressionLike(callee)) {
        return false;
    }

    const methodName = getStaticPropertyName(callee);
    return !!methodName && ALLOWED_MEMBER_CALL_NAMES.has(methodName);
}

/**
 * Returns true when a symbol or its type appears to be an Angular Signal.
 */
function isSignalSymbol(symbol: any, typeChecker: any): boolean {
    if (!symbol) return false;
    const decl = symbol.valueDeclaration || symbol.declarations?.[0];
    if (!decl) return false;

    const type = typeChecker.getTypeOfSymbolAtLocation(symbol, decl);
    if (!type) return false;

    const typeStr = typeChecker.typeToString(type);
    // Conservative check: includes both Signal and WritableSignal patterns
    return typeStr.includes('Signal') || typeStr.includes('writable') || typeStr.includes('computed');
}

/**
 * Returns true when the name refers to a Signal in the component class.
 */
function isSignalReference(name: string, context: RuleContext): boolean {
    // Phase 1: Heuristic fallback (fast, handles missing type info)
    const looksLikeGetter = name.startsWith('get') || name.startsWith('is') || name.startsWith('has');
    
    // Phase 2: TypeChecker validation
    if (context.typeChecker && context.crossRef?.componentPath) {
        try {
            const typeChecker = context.typeChecker;
            const componentPath = context.crossRef.componentPath;
            const program = (typeChecker as any).getProgram();
            const sourceFile = program.getSourceFile(componentPath);

            if (sourceFile) {
                // Find the first class in the component file (usually the component itself)
                const classDecl = sourceFile.statements.find(
                    (s: any): s is any => 
                        s.kind === 263 /* ClassDeclaration */
                );

                if (classDecl && classDecl.name) {
                    const classType = typeChecker.getTypeAtLocation(classDecl);
                    const member = typeChecker.getPropertyOfType(classType, name);
                    
                    if (member) {
                        return isSignalSymbol(member, typeChecker);
                    }
                }
            }
        } catch {
            // Fall through to heuristic if type checking fails
        }
    }

    // Default: if it looks like a getter, it's likely NOT a signal.
    // Otherwise, for zero-arg calls, we assume it's a signal to avoid false positives.
    return !looksLikeGetter;
}

/**
 * Returns true when the expression subtree contains a flagged function call.
 */
function hasFlaggedCallExpression(root: MaybeAstNode, context: RuleContext): boolean {
    const stack: AstNode[] = root ? [root] : [];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const node = unwrapNode(current);
        if (!node) {
            continue;
        }

        if (isCallExpressionLike(node)) {
            if (!isAllowedCall(node)) {
                if (hasArguments(node)) {
                    return true;
                }
                
                // Zero-arg call: check if it's a Signal
                const name = getCallName(node);
                if (name && !isSignalReference(name, context)) {
                    return true;
                }
            }
        }

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }

    return false;
}

/**
 * Builds the failure message for flagged template call expressions.
 */
function buildFailureMessage(): string {
    return 'Avoid calling methods directly in templates as they execute on every change detection cycle. Use Signals, computed state, or Pipes instead.';
}

/**
 * Creates a rule failure for a flagged call expression in a template binding.
 *
 * Note:
 * This rule reports at the template expression start rather than at a nested
 * call-expression offset because inner expression-node offsets may not align
 * with Angular template source spans.
 */
function createFailure(
    node: TemplateExpressionNode,
    context: RuleContext,
): RuleFailure {
    const offset = getTemplateAbsoluteOffset(context, node);
    const { line, column } = context.locator.location(offset);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: buildFailureMessage(),
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
    };
}

/**
 * Disallows non-allowlisted function calls with arguments in Angular template bindings.
 */
export const templateNoCallExpressionRule = createTemplateExpressionRule(
    RULE_NAME,
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure[] | null => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expression = (node as any).expression;

        if (!hasFlaggedCallExpression(expression, context)) {
            return null;
        }

        return [createFailure(node, context)];
    },
    {
        requires: { htmlAst: true, typeChecker: true, projectContext: true },
    },
);