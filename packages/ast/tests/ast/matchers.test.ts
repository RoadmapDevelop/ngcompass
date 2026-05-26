import { describe, it, expect } from 'vitest';
import { parseTs } from '../../src/parsers/ts.js';
import {
  hasDecorator,
  getDecoratorNameUnsafe,
} from '../../src/ast/matchers.js';
import { walkProgram } from '../../src/visitor.js';

describe('ast/matchers', () => {
  it('hasDecorator and getDecoratorNameUnsafe handle standard decorators', () => {
    const source = `
            @Component({ selector: 'test' }) class TestComp {}
            @Injectable() class TestService {}
        `;
    const result = parseTs(source, 'test.ts');
    let componentsFound = 0;

    walkProgram(result.program, (node) => {
      if (node.type === 'ClassDeclaration') {
        if (hasDecorator(node as any, 'Component')) {
          componentsFound++;
          const name = getDecoratorNameUnsafe(
            (node as any).decorators[0] as any
          );
          expect(name).toBe('Component');
        }
        if (hasDecorator(node as any, 'Injectable')) {
          const name = getDecoratorNameUnsafe(
            (node as any).decorators[0] as any
          );
          expect(name).toBe('Injectable');
        }
      }
    });
    expect(componentsFound).toBe(1);
  });
});
