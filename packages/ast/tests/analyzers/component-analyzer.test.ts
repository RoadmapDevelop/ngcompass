import { describe, it, expect, beforeEach } from 'vitest';
import {
  analyzeComponent,
  isComponent,
  usesOnPush,
  isStandalone,
  resetComponentCacheStats,
  getComponentCacheStats,
} from '../../src/analyzers/component-analyzer.js';
import { parseTs } from '../../src/parsers/ts.js';

describe('component-analyzer', () => {
  beforeEach(() => {
    resetComponentCacheStats();
  });

  it('extracts literal scalar metadata from @Component', () => {
    const source = `
            @Component({
                selector: 'app-test',
                standalone: true,
                changeDetection: ChangeDetectionStrategy.OnPush,
                templateUrl: './xyz.html',
                template: '<div></div>',
            })
            class TestComp {}
        `;
    const result = parseTs(source, 'test.ts');
    const cls = result.program.body[0] as any;
    const metadata = analyzeComponent(cls);

    expect(metadata).not.toBeNull();
    if (metadata) {
      expect(metadata.selector.kind).toBe('literal');
      expect((metadata.selector as any).value).toBe('app-test');

      expect(metadata.standalone.kind).toBe('literal');
      expect((metadata.standalone as any).value).toBe(true);

      expect(metadata.changeDetection.kind).toBe('literal');
      expect((metadata.changeDetection as any).value).toBe(1);

      expect(metadata.templateUrl.kind).toBe('literal');
      expect((metadata.templateUrl as any).value).toBe('./xyz.html');

      expect(metadata.template.kind).toBe('literal');
      expect((metadata.template as any).value).toBe('<div></div>');
    }
  });

  it('caches successive calls on the same class declaration', () => {
    const source = `
            @Component({ selector: 'test' }) class TestComp {}
        `;
    const result = parseTs(source, 'test.ts');
    const cls = result.program.body[0] as any;

    analyzeComponent(cls);
    analyzeComponent(cls);
    analyzeComponent(cls);

    const stats = getComponentCacheStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
  });

  it('returns null for empty classes', () => {
    const source = `class TestComp {}`;
    const result = parseTs(source, 'test.ts');
    const cls = result.program.body[0] as any;

    expect(analyzeComponent(cls)).toBeNull();
    expect(isComponent(cls)).toBe(false);
    expect(usesOnPush(cls)).toBe(false);
    expect(isStandalone(cls)).toBe(false);
  });
});
