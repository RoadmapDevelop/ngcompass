import { describe, it, expect } from 'vitest';
import { validateConfiguration } from '../src/health/validator.js';
import { validateGlobPatterns } from '../src/health/checks/globs.js';
import type {
  ValidationContext,
  ValidatedConfig,
} from '../src/health/types.js';

function createMockContext(
  overrides?: Partial<ValidationContext>
): ValidationContext {
  return {
    cwd: '/test/root',
    fs: {
      existsSync: () => true,
      accessSync: () => {},
    },
    os: {
      cpus: () => [{ model: 'test-vcore-0' }, { model: 'test-vcore-1' }],
    },
    path: {
      dirname: (p: string) => {
        const normalized = p.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash);
      },
      resolve: (...parts: string[]) =>
        parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
      isAbsolute: (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p),
    },
    ...overrides,
  };
}

describe('Resilience: Glob Pattern Defensive Guards', () => {
  it('should not throw when array-expected fields are bare strings', () => {
    const malformed = { include: 'src/**/*.ts' } as unknown as ValidatedConfig;
    expect(() => validateGlobPatterns(malformed)).not.toThrow();
  });

  it('should handle null or non-object values gracefully', () => {
    const malformed = {
      include: null,
      exclude: 42,
    } as unknown as ValidatedConfig;
    expect(() => validateGlobPatterns(malformed)).not.toThrow();
  });
});

describe('Resilience: Pipeline Fault Tolerance', () => {
  it('should report both schema and semantic errors in a single pass', async () => {
    const result = await validateConfiguration(
      {
        maxWorkers: 'high',
        maxWarnings: -1,
      },
      createMockContext()
    );

    const codes = result.report.issues.map((i) => i.code);

    expect(codes).toContain('negative-max-warnings');

    const hasSchemaError = result.report.issues.some(
      (i) => i.severity === 'error'
    );
    expect(hasSchemaError).toBe(true);
  });

  it('should aggregate issues from independent semantic check modules', async () => {
    const result = await validateConfiguration(
      {
        include: ['src/**/*.ts'],
        maxWarnings: -1,
        rules: { '': 'error' },
      },
      createMockContext()
    );

    const codes = result.report.issues.map((i) => i.code);
    expect(codes).toContain('negative-max-warnings');
    expect(codes).toContain('empty-rule-name');
  });

  it('should deduplicate identical issues reported by multiple checks', async () => {
    const result = await validateConfiguration(
      {
        include: ['src/**/*.ts'],
        maxWarnings: -1,
      },
      createMockContext()
    );

    const matchingIssues = result.report.issues.filter(
      (i) => i.code === 'negative-max-warnings'
    );

    expect(matchingIssues).toHaveLength(1);
  });

  it('should prioritize errors over warnings in the final report output', async () => {
    const result = await validateConfiguration(
      {
        include: ['src/**/*.ts'],
        maxWarnings: -1,
        rules: {},
      },
      createMockContext()
    );

    const severities = result.report.issues.map((i) => i.severity);
    const firstWarn = severities.indexOf('warning');
    const lastError = severities.lastIndexOf('error');

    if (firstWarn !== -1 && lastError !== -1) {
      expect(lastError).toBeLessThan(firstWarn);
    }
  });

  it('should block config exposure if any error-level issues exist', async () => {
    const result = await validateConfiguration(
      { maxWarnings: -1 },
      createMockContext()
    );

    expect(result.report.valid).toBe(false);
    expect(result.config).toBeUndefined();
  });

  it('should expose the normalized config if only warnings are present', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], rules: {} },
      createMockContext()
    );

    expect(result.report.valid).toBe(true);
    expect(result.config).toBeDefined();
  });
});
