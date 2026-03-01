import type { CallExpression } from '@ngcompass/ast';

import { createCallExpressionRule } from '@ngcompass/engine';
import { AstNode, getNodeStart, getStaticPropertyName, isMemberExpressionLike, unwrapNode } from '../rule-utils';
import { RuleContext } from '@ngcompass/common';
import { RuleFailure } from '@ngcompass/common';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../recommendations';

const DISCOURAGED_CDR_METHODS = new Set(['detectChanges', 'markForCheck']);

const CDR_VAR_NAMES = new Set([
    'cdr', 'cdref', 'changedetectorref', '_cdr', '_cdref',
    'changedetector', '_changedetector', 'changedetectionref',
    'cd', '_cd', 'ref',
]);

function getReceiverIdentifier(memberObject: AstNode | null | undefined): string {
    const obj = unwrapNode(memberObject);
    if (!obj) return '';
    if (obj.type === 'Identifier') return (obj.name as string) ?? '';
    if (isMemberExpressionLike(obj)) return getStaticPropertyName(obj) || '';
    return '';
}

/**
 * Returns true when the source text contains any ChangeDetectorRef-related symbols.
 * Used as a gate before allowing bare-identifier CDR method detection.
 */
function hasChangeDetectorRefSignals(sourceText: string | undefined): boolean {
    if (typeof sourceText !== 'string') return false;
    return (
        /\bChangeDetectorRef\b/.test(sourceText) ||
        /\bdetectChanges\b/.test(sourceText) ||
        /\bmarkForCheck\b/.test(sourceText)
    );
}

/**
 * Per-file cache for the CDR signals presence check.
 *
 * The CallExpression rule fires for every call node in a file. Without caching,
 * hasChangeDetectorRefSignals() would run 3 regex scans on the full source text
 * for every single call expression — potentially dozens of times per component.
 * Keyed by filePath: stable within a single analysis session.
 */
const fileCdrPresenceCache = new Map<string, boolean>();

function fileContainsCdrSignals(filePath: string, sourceText: string | undefined): boolean {
    const cached = fileCdrPresenceCache.get(filePath);
    if (cached !== undefined) return cached;

    const result = hasChangeDetectorRefSignals(sourceText);
    fileCdrPresenceCache.set(filePath, result);
    return result;
}

/**
 * Flags manual change detection triggers in Angular component files.
 */
export const componentNoManualDetectChangesRule = createCallExpressionRule(
    'component-no-manual-detect-changes',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const sourceText: string | undefined = (context as any).sourceText;
        const allowBareIdentifierChecks = fileContainsCdrSignals(context.filePath, sourceText);

        const callee = unwrapNode((node as any).callee);
        let methodName = '';
        let shouldFlag = false;

        if (isMemberExpressionLike(callee)) {
            methodName = getStaticPropertyName(callee);
            if (DISCOURAGED_CDR_METHODS.has(methodName)) {
                const receiverName = getReceiverIdentifier(callee?.object).toLowerCase();
                shouldFlag = CDR_VAR_NAMES.has(receiverName);
            }
        } else if (callee?.type === 'Identifier') {
            methodName = (callee.name as string) ?? '';
            shouldFlag = allowBareIdentifierChecks && DISCOURAGED_CDR_METHODS.has(methodName);
        }

        if (!shouldFlag) return null;

        const start = getNodeStart(node as any);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'component-no-manual-detect-changes',
            message: `Avoid manual change detection (${methodName}). Prefer Signals/async pipe for reactivity.`,
            line,
            column,
            severity: 'high',
            fix: RECOMMENDATIONS['component-no-manual-detect-changes'],
            codeExample: CODE_EXAMPLES['component-no-manual-detect-changes'],
        };
    }
);

