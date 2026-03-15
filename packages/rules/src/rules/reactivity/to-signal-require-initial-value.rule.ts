import { hasObjectProperty, ObjectExpression } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, getObjectProperty, isLiteralTrue, isLiteralNullOrUndefined, isCalleeNamed, getNodeStart, unwrapNode } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";


function hasValidRequireSync(options: AstNode): boolean {
    const prop = getObjectProperty(options, 'requireSync');
    if (!prop) return false;
    return isLiteralTrue(prop.value as AstNode);
}

function hasNonNullInitialValue(options: AstNode): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!hasObjectProperty(options as any as ObjectExpression, 'initialValue')) return false;
    const prop = getObjectProperty(options, 'initialValue');
    if (!prop) return true;
    return !isLiteralNullOrUndefined(prop.value as AstNode);
}

/**
 * Requires an explicit initial state configuration for `toSignal(...)`.
 */
export const toSignalRequireInitialValueRule = createCallExpressionRule(
    'toSignal-require-initialValue',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const call = node as unknown as AstNode;

        if (!isCalleeNamed(call.callee, 'toSignal')) return null;

        const args: AstNode[] = Array.isArray(call.arguments) ? call.arguments : [];

        if (args.length < 2) {
            const start = getNodeStart(call);
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'toSignal-require-initialValue',
                message: 'Provide toSignal() options with initialValue (preferred) or requireSync: true for predictable state and stronger typing.',
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['toSignal-require-initialValue'],
            };
        }

        const optionsArg = unwrapNode(args[1]);
        if (!optionsArg || optionsArg.type !== 'ObjectExpression') return null;

        const ok = hasNonNullInitialValue(optionsArg) || hasValidRequireSync(optionsArg);
        if (ok) return null;

        const start = getNodeStart(call);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'toSignal-require-initialValue',
            message: 'Provide toSignal() options with initialValue (preferred) or requireSync: true for predictable state and stronger typing.',
            line,
            column,
            severity: 'warn',
            fix: RECOMMENDATIONS['toSignal-require-initialValue'],
        };
    }
);

