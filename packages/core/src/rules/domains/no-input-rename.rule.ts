import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import {
    getDecoratorNameUnsafe,
    getLiteralStringValueUnsafe,
    isInputSignal,
    getInputSignalAliasUnsafe,
    getKeyNameUnsafe,
} from '../ast/matchers.js';
import type {
    PropertyDefinition,
    CallExpression,
    Identifier,
    ObjectExpression,
    ObjectProperty,
} from '../ast/types.js';

export const noInputRenameRule = createComponentRule(
    'no-input-rename',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const failures: RuleFailure[] = [];
        const selector = classNode.metadata.selector.kind === 'literal' ? classNode.metadata.selector.value : undefined;

        // 1. Process Properties (@Input() and input())
        const body = classNode.node.body?.body;
        if (body) {
            for (const member of body) {
                if (member.type !== 'PropertyDefinition') continue;

                const property = member as PropertyDefinition;
                const propertyName = property.key.type === 'Identifier' ? (property.key as Identifier).name : undefined;
                if (!propertyName) continue;

                let aliasName: string | undefined;
                let errorStart = property.start ?? property.span?.start ?? classNode.metadata.decoratorStart;

                // Check @Input() decorator
                if (property.decorators) {
                    for (const decorator of property.decorators) {
                        if (getDecoratorNameUnsafe(decorator) === 'Input') {
                            const expr = decorator.expression;
                            if (expr?.type === 'CallExpression') {
                                const args = (expr as CallExpression).arguments;
                                if (args.length > 0) {
                                    const first = args[0];
                                    if (first.type === 'StringLiteral' || first.type === 'Literal') {
                                        aliasName = getLiteralStringValueUnsafe(first);
                                    } else if (first.type === 'ObjectExpression') {
                                        const objExpr = first as ObjectExpression;
                                        const aliasProp = objExpr.properties.find(
                                            p => p.type !== 'SpreadElement' && getKeyNameUnsafe((p as ObjectProperty).key) === 'alias'
                                        ) as ObjectProperty | undefined;
                                        aliasName = aliasProp ? getLiteralStringValueUnsafe(aliasProp.value) : undefined;
                                    }
                                }
                            }
                            errorStart = decorator.start ?? decorator.span?.start ?? errorStart;
                            break;
                        }
                    }
                }

                // Check input() signal
                if (!aliasName && property.value && isInputSignal(property.value)) {
                    aliasName = getInputSignalAliasUnsafe(property.value as CallExpression);
                    errorStart = property.value.start ?? property.value.span?.start ?? errorStart;
                }

                if (aliasName && !isAllowedAlias(aliasName, propertyName, selector)) {
                    const { line, column } = context.locator.location(errorStart);
                    failures.push({
                        filePath: context.filePath,
                        message: `Input '${propertyName}' should not be renamed to '${aliasName}'. Avoid aliasing inputs to maintain a consistent and predictable API.`,
                        line,
                        column,
                        severity: 'moderate',
                        ruleName: 'no-input-rename',
                    });
                }
            }
        }

        // 2. Process hostDirectives
        const hostDirectives = classNode.metadata.hostDirectives;
        if (hostDirectives.kind === 'literal') {
            for (const hd of hostDirectives.value) {
                for (const input of hd.inputs) {
                    if (input.internal !== input.external) {
                        const { line, column } = context.locator.location(classNode.metadata.decoratorStart);
                        failures.push({
                            filePath: context.filePath,
                            message: `Host directive input '${input.internal}' should not be renamed to '${input.external}'.`,
                            line,
                            column,
                            severity: 'moderate',
                            ruleName: 'no-input-rename',
                        });
                    }
                }
            }
        }

        return failures.length > 0 ? failures : null;
    }
);

/**
 * Checks if an alias is allowed (e.g., it matches the directive's attribute selector).
 */
function isAllowedAlias(alias: string, propertyName: string, selector?: string): boolean {
    if (alias === propertyName) return true;
    if (!selector) return false;

    // Split selectors (if comma separated)
    const selectors = selector.split(',').map(s => s.trim());

    for (const sel of selectors) {
        // Handle attribute selectors [attr] or element[attr]
        const match = sel.match(/\[([^\]]+)\]/);
        if (match) {
            const attr = match[1];
            if (alias === attr) return true;
        }

        // Handle simple element/class selectors by stripping symbols
        const cleanSelector = sel.replace(/[\[\].]/g, '');
        if (alias === cleanSelector) return true;
    }

    return false;
}
