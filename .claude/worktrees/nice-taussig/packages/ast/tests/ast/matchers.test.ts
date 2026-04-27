import { describe, it, expect } from 'vitest';
import { parseTs } from '../../src/parsers/ts.js';
import { hasDecorator, getDecoratorNameUnsafe, isInputSignal } from '../../src/ast/matchers.js';
import { walkProgram } from '../../src/visitor.js';

describe('ast/matchers', () => {
    it('hasDecorator and getDecoratorNameUnsafe handle standard decorators', () => {
        const source = `
            @Component({ selector: 'test' }) class TestComp {}
            @Injectable() class TestService {}
        `;
        const result = parseTs(source, 'test.ts');
        let componentsFound = 0;
        
        walkProgram(result.program, node => {
            if (node.type === 'ClassDeclaration') {
                if (hasDecorator(node as any, 'Component')) {
                    componentsFound++;
                    const name = getDecoratorNameUnsafe((node as any).decorators[0] as any);
                    expect(name).toBe('Component');
                }
                if (hasDecorator(node as any, 'Injectable')) {
                    const name = getDecoratorNameUnsafe((node as any).decorators[0] as any);
                    expect(name).toBe('Injectable');
                }
            }
        });
        expect(componentsFound).toBe(1);
    });

    it('isInputSignal handles input() and input.required()', () => {
        const source = `
            const a = input();
            const b = input.required();
            const c = someOtherCall();
        `;
        const result = parseTs(source, 'test.ts');
        let inputs = 0;
        let requiredInputs = 0;
        let missing = 0;

        walkProgram(result.program, node => {
            if (node.type === 'CallExpression') {
                if (isInputSignal(node as any)) {
                    if ((node as any).callee.type === 'Identifier') {
                        inputs++;
                    } else {
                        requiredInputs++;
                    }
                } else {
                    missing++;
                }
            }
        });
        
        expect(inputs).toBe(1);
        expect(requiredInputs).toBe(1);
        expect(missing).toBe(1); // someOtherCall
    });
});
