import { RuleFailure, RuleContext } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, getObjectProperty, isLiteralTrue, isLiteralNullOrUndefined, isCalleeNamed, getNodeStart, unwrapNode } from "../../rule-utils";

const RULE_NAME = 'toSignal-require-initialValue';

function isOk(options: AstNode): boolean {
    const initial = getObjectProperty(options, 'initialValue');
    if (initial && !isLiteralNullOrUndefined(initial.value as AstNode)) return true;
    
    const sync = getObjectProperty(options, 'requireSync');
    return !!sync && isLiteralTrue(sync.value as AstNode);
}

export const toSignalRequireInitialValueRule = createCallExpressionRule(
    RULE_NAME,
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const astNode = node as unknown as AstNode;
        if (!isCalleeNamed(astNode.callee, 'toSignal')) return null;

        const args = Array.isArray(astNode.arguments) ? astNode.arguments : [];
        const options = args[1] ? unwrapNode(args[1]) : null;

        if (!options || options.type !== 'ObjectExpression' || !isOk(options)) {
            const { line, column } = context.locator.location(getNodeStart(astNode));
            return {
                filePath: context.filePath,
                ruleName: RULE_NAME,
                message: 'toSignal() can emit undefined before the observable produces a value.',
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS[RULE_NAME],
            };
        }

        return null;
    }
);

