import { describe, it, expect } from 'vitest';
import { parseTs } from '../src/parsers/ts.js';
import {
  toAngularClassStream,
  toAnyAngularClassStream,
  toDecoratedPropertyStream,
} from '../src/node-streams.js';
import { walkProgram } from '../src/visitor.js';

describe('node-streams', () => {
  it('toAngularClassStream identifies @Component', () => {
    const source = `
            @Component({ selector: 'test' }) class TestComp {}
        `;
    const result = parseTs(source, 'test.ts');
    let matched = false;
    walkProgram(result.program, (node) => {
      if (node.type === 'ClassDeclaration') {
        const stream = toAngularClassStream(node as any);
        if (stream) {
          matched = true;
          expect(stream.metadata).toBeDefined();
        }
      }
    });
    expect(matched).toBe(true);
  });

  it('toAnyAngularClassStream identifies @Injectable', () => {
    const source = `
            @Injectable() class TestService {}
        `;
    const result = parseTs(source, 'test.ts');
    let matched = false;
    walkProgram(result.program, (node) => {
      if (node.type === 'ClassDeclaration') {
        const stream = toAnyAngularClassStream(node as any);
        if (stream) {
          matched = true;
          expect(stream.decoratorName).toBe('Injectable');
          expect(stream.className).toBe('TestService');
        }
      }
    });
    expect(matched).toBe(true);
  });

  it('toDecoratedPropertyStream identifies @Input()', () => {
    const source = `
            class TestComp {
                @Input() myProp: string;
            }
        `;
    const result = parseTs(source, 'test.ts');
    let matched = false;
    walkProgram(result.program, (node) => {
      if (node.type === 'PropertyDefinition') {
        const stream = toDecoratedPropertyStream(node as any);
        if (stream) {
          matched = true;
          expect(stream.decorators.length).toBe(1);
        }
      }
    });
    expect(matched).toBe(true);
  });
});
