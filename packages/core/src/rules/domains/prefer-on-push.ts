import { RuleResult, RuleContext, RuleFailure } from '../types.js';
import { Locator } from '../../utils/locator.js';

/**
 * Checks if a component uses ChangeDetectionStrategy.OnPush
 * Oxc Implementation
 */
export const preferOnPush = (context: RuleContext): RuleResult => {
    const { program, fileContent, filePath } = context;
    const failures: RuleFailure[] = [];

    if (!program) {
        return { ruleName: 'prefer-on-push-component-change-detection', failures: [] };
    }

    const locator = new Locator(fileContent);

    // Generalized Recursive Walker for Oxc AST
    const visit = (node: any) => {
        if (!node) return;

        // Check for ClassDeclaration
        if (node.type === 'ClassDeclaration') {
            checkClass(node);
        }

        // Recursively visit children
        for (const key of Object.keys(node)) {
            const val = node[key];
            if (Array.isArray(val)) {
                val.forEach(child => visit(child));
            } else if (typeof val === 'object' && val !== null && val.type) {
                visit(val);
            }
        }
    };

    const checkClass = (node: any) => {
        // Oxc decorators are usually on the node.decorators array
        const decorators = node.decorators;
        if (!decorators || decorators.length === 0) return;

        for (const decorator of decorators) {
            // Check @Component
            if (decorator.expression.type === 'CallExpression' &&
                decorator.expression.callee.type === 'Identifier' &&
                decorator.expression.callee.name === 'Component') {

                const args = decorator.expression.arguments;
                if (args.length > 0 && args[0].type === 'ObjectExpression') {
                    const properties = args[0].properties;
                    let hasOnPush = false;

                    for (const prop of properties) {
                        // Check changeDetection property
                        if (prop.type === 'ObjectProperty' &&
                            prop.key.type === 'Identifier' &&
                            prop.key.name === 'changeDetection') {

                            // Check value: ChangeDetectionStrategy.OnPush
                            // This is typically a MemberExpression or StaticMemberExpression
                            const value = prop.value;
                            if (value.type === 'MemberExpression' || value.type === 'StaticMemberExpression') {
                                if (value.object.type === 'Identifier' &&
                                    value.object.name === 'ChangeDetectionStrategy' &&
                                    value.property.name === 'OnPush') {
                                    hasOnPush = true;
                                }
                            }
                        }
                    }

                    if (!hasOnPush) {
                        const start = decorator.span?.start || 0;
                        const { line, column } = locator.location(start);

                        failures.push({
                            filePath: filePath,
                            message: `Component '${node.id?.name || 'Unknown'}' should use ChangeDetectionStrategy.OnPush`,
                            line,
                            column,
                            severity: 'critical',
                            ruleName: 'prefer-on-push-component-change-detection'
                        });
                    }
                }
            }
        }
    };

    visit(program);

    return {
        ruleName: 'prefer-on-push-component-change-detection',
        failures
    };
};
