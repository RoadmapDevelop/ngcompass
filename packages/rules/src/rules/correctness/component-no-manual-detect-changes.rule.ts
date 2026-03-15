import type { CallExpression } from '@ngcompass/ast';

import { createCallExpressionRule } from '@ngcompass/engine';
import { AstNode, getNodeStart, getStaticPropertyName, isMemberExpressionLike, unwrapNode } from '../../rule-utils';
import { RuleContext } from '@ngcompass/common';
import { RuleFailure } from '@ngcompass/common';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

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
 * for every single call expression � potentially dozens of times per component.
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
 * RULE-ACC-004: Returns true when the source file declares `ChangeDetectionStrategy.OnPush`.
 *
 * With `OnPush`, calling `markForCheck()` is correct Angular practice — it schedules the
 * component for the next CD cycle without forcing a synchronous traversal.  Flagging it in
 * this context produces false positives and discourages idiomatic OnPush usage.
 *
 * `detectChanges()` remains flagged even under OnPush (it forces synchronous CD) but is
 * downgraded from `error` to `warn` since it can be intentional in edge-cases.
 */
const fileOnPushCache = new Map<string, boolean>();

function fileUsesOnPush(filePath: string, fileContent: string): boolean {
    const cached = fileOnPushCache.get(filePath);
    if (cached !== undefined) return cached;

    const result = /ChangeDetectionStrategy\.OnPush/.test(fileContent);
    fileOnPushCache.set(filePath, result);
    return result;
}

/**
 * Flags manual change detection triggers in Angular component files.
 *
 * RULE-ACC-004: Respects `ChangeDetectionStrategy.OnPush`:
 *  - `markForCheck()` with OnPush is valid (schedules re-render) → not flagged.
 *  - `detectChanges()` with OnPush is unusual but can be intentional → downgraded to `warn`.
 *  - Both methods under default CD → flagged as `error` (unchanged).
 */
export const componentNoManualDetectChangesRule = createCallExpressionRule(
    'component-no-manual-detect-changes',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const sourceText: string | undefined = (context as unknown as Record<string, unknown>).sourceText as string | undefined;
        const allowBareIdentifierChecks = fileContainsCdrSignals(context.filePath, sourceText);

        const callee = unwrapNode((node as unknown as AstNode).callee);
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

        // RULE-ACC-004: Check ChangeDetectionStrategy before deciding severity / skip.
        const isOnPush = fileUsesOnPush(context.filePath, context.fileContent);

        if (isOnPush) {
            // markForCheck() is the idiomatic way to trigger re-render under OnPush — skip it.
            if (methodName === 'markForCheck') return null;

            // detectChanges() under OnPush is unusual but can be intentional — warn only.
            const start = getNodeStart(node as unknown as AstNode);
            const { line, column } = context.locator.location(start);
            return {
                filePath: context.filePath,
                ruleName: 'component-no-manual-detect-changes',
                message: `Prefer Signals or async pipe over detectChanges() even with OnPush. Manual CD triggers couple your component to imperative rendering.`,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['component-no-manual-detect-changes'],
                codeExample: CODE_EXAMPLES['component-no-manual-detect-changes'],
            };
        }

        const start = getNodeStart(node as unknown as AstNode);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'component-no-manual-detect-changes',
            message: `Avoid manual change detection (${methodName}). Prefer Signals/async pipe for reactivity.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['component-no-manual-detect-changes'],
            codeExample: CODE_EXAMPLES['component-no-manual-detect-changes'],
        };
    }
);

