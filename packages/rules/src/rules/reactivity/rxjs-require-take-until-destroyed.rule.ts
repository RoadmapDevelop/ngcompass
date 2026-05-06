import { RuleFailure, RuleContext } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { 
    AstNode, isSubscribeCall, unwrapNode, isMemberExpressionLike, 
    hasTeardownInReceiverChain, getNodeStart, 
    findObservableSourceCall, isLikelyHttpObservable 
} from "../../rule-utils";

const manualTeardownCache = new Map<string, boolean>();
const CACHE_LIMIT = 500;

export function hasManualTeardownInNgOnDestroy(fileContent: string): boolean {
    return /ngOnDestroy\s*\([^)]*\)\s*\{[^}]*\.unsubscribe\s*\(\)/s.test(fileContent);
}

function hasManualTeardown(filePath: string, fileContent: string): boolean {
    let result = manualTeardownCache.get(filePath);
    if (result !== undefined) return result;

    result = hasManualTeardownInNgOnDestroy(fileContent);
    if (manualTeardownCache.size >= CACHE_LIMIT) manualTeardownCache.clear();
    manualTeardownCache.set(filePath, result);
    return result;
}

export const rxjsRequireTakeUntilDestroyedRule = createCallExpressionRule(
    'rxjs-require-takeUntilDestroyed',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const astNode = node as unknown as AstNode;
        if (!isSubscribeCall(astNode)) return null;

        const callee = unwrapNode(astNode.callee);
        const receiver = isMemberExpressionLike(callee) ? callee?.object : null;

        if (receiver && hasTeardownInReceiverChain(receiver)) return null;

        const sourceCall = findObservableSourceCall(receiver);
        if (isLikelyHttpObservable(sourceCall)) return null;

        if (hasManualTeardown(context.filePath, context.fileContent)) return null;

        const start = getNodeStart(astNode);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'rxjs-require-takeUntilDestroyed',
            message: 'A component subscription without teardown can keep running after the component is destroyed.',
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['rxjs-require-takeUntilDestroyed'],
        };
    }
);
