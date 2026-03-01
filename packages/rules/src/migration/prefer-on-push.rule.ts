import { ChangeDetectionStrategy, type AngularClassNode } from '@ngcompass/ast';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../recommendations'; import { createComponentRule } from '@ngcompass/engine';
import { RuleContext, RuleFailure } from '@ngcompass/common';

type AnyNode = any;

function getSafeReportOffset(classNode: AngularClassNode): number {
    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
    return (
        metadata?.decoratorStart ??
        metadata?.start ??
        (classNode as AnyNode)?.node?.start ??
        (classNode as AnyNode)?.start ??
        0
    );
}

function getComponentName(classNode: AngularClassNode): string {
    const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
    return metadata?.className ?? 'AnonymousComponent';
}

function isReportableChangeDetection(changeDetection: AnyNode): boolean {
    if (!changeDetection || typeof changeDetection !== 'object') return false;
    const kind = changeDetection.kind;
    if (kind === 'non-literal') return false;
    if (kind === 'literal') return changeDetection.value !== ChangeDetectionStrategy.OnPush;
    if (kind === 'missing') return true;
    return false;
}

/**
 * Enforces ChangeDetectionStrategy.OnPush for Angular components.
 */
export const preferOnPushRule = createComponentRule(
    'prefer-on-push-component-change-detection',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        const metadata: AnyNode = (classNode as AnyNode)?.metadata ?? {};
        if (metadata.type !== 'Component') return null;

        const changeDetection = metadata.changeDetection;
        if (!isReportableChangeDetection(changeDetection)) return null;

        const offset = getSafeReportOffset(classNode);
        const { line, column } = context.locator.location(offset);
        const name = getComponentName(classNode);

        return {
            filePath: context.filePath,
            ruleName: 'prefer-on-push-component-change-detection',
            message: `Component '${name}' should use ChangeDetectionStrategy.OnPush.`,
            line,
            column,
            severity: 'critical',
            fix: RECOMMENDATIONS['prefer-on-push-component-change-detection'],
            codeExample: CODE_EXAMPLES['prefer-on-push-component-change-detection'],
        };
    }
);

