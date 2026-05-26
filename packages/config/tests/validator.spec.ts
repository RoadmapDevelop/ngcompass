import { describe, it, expect, vi } from 'vitest';
import { validateConfiguration } from '../src/health/validator.js';
import { validateCrossFields } from '../src/health/checks/cross-fields.js';
import { validatePaths } from '../src/health/checks/paths.js';
import type {
  ValidationContext,
  ValidatedConfig,
} from '../src/health/types.js';

function mockContext(
  overrides: Partial<ValidationContext> = {}
): ValidationContext {
  return {
    cwd: '/project',
    fs: {
      existsSync: () => true,
      accessSync: () => undefined,
    },
    os: { cpus: () => [{ model: 'cpu' }, { model: 'cpu' }] },
    path: {
      dirname: (p: string) => {
        const norm = p.replace(/\\/g, '/');
        const idx = norm.lastIndexOf('/');
        return idx <= 0 ? '/' : norm.slice(0, idx);
      },
      resolve: (...parts: string[]) =>
        parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
      isAbsolute: (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p),
    },
    ...overrides,
  };
}

function mockConfig(overrides: Partial<ValidatedConfig> = {}): ValidatedConfig {
  return {
    include: ['src/**/*.ts'],
    exclude: ['node_modules/**'],
    rules: { 'some-rule': 'warn' },
    outputFormat: 'json' as any,
    failOnSeverity: 'error' as any,
    maxWarnings: 10,
    ignorePatterns: [],
    overrides: [],
    maxWorkers: 2,
    cache: {
      enabled: true,
      location: '.cache',
      strategy: 'local',
      ttl: 0,
    } as any,
    ...overrides,
  } as ValidatedConfig;
}

describe('validateConfiguration — profile resolution', () => {
  it('merges the profile block over the base config and validates the result', async () => {
    const raw = {
      include: ['src/**/*.ts'],
      rules: { 'base-rule': 'warn' },
      profiles: {
        ci: {
          include: ['src/**/*.ts'],
          rules: { 'base-rule': 'error' },
        },
      },
    };

    const result = await validateConfiguration(
      raw,
      mockContext({ profile: 'ci' })
    );

    const errors = result.report.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('returns profile-not-found when profile key is missing from profiles map', async () => {
    const raw = {
      include: ['src/**/*.ts'],
      profiles: {
        staging: { include: ['src/**/*.ts'] },
      },
    };

    const result = await validateConfiguration(
      raw,
      mockContext({ profile: 'nonexistent' })
    );
    expect(result.report.valid).toBe(false);
    const issue = result.report.issues[0];
    expect(issue.code).toBe('error-profile-not-found');
    expect(issue.message).toContain('nonexistent');
    expect(issue.message).toContain('staging');
  });

  it('lists all available profiles in the not-found error message', async () => {
    const raw = {
      include: ['src/**/*.ts'],
      profiles: {
        dev: {},
        prod: {},
      },
    };

    const result = await validateConfiguration(
      raw,
      mockContext({ profile: 'qa' })
    );
    expect(result.report.issues[0].message).toContain('dev');
    expect(result.report.issues[0].message).toContain('prod');
  });

  it('attributes the not-found issue to the supplied filePath', async () => {
    const raw = { include: ['src/**/*.ts'], profiles: {} };
    const result = await validateConfiguration(
      raw,
      mockContext({ profile: 'prod' }),
      '/project/ngcompass.config.ts'
    );
    expect(result.report.issues[0].file).toBe('/project/ngcompass.config.ts');
  });
});

describe('validateConfiguration — result shape', () => {
  it('returns a resolved config object when validation passes', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], rules: { 'a-rule': 'warn' } },
      mockContext()
    );
    const errors = result.report.issues.filter((i) => i.severity === 'error');
    if (errors.length === 0) {
      expect(result.config).toBeDefined();
      expect(result.report.valid).toBe(true);
    }
  });

  it('returns config: undefined when there are errors', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], maxWarnings: -1 },
      mockContext()
    );
    expect(result.config).toBeUndefined();
    expect(result.report.valid).toBe(false);
  });

  it('deduplicates identical issues emitted by multiple checks', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], maxWarnings: -1 },
      mockContext()
    );

    const issues = result.report.issues;
    const keys = issues.map(
      (i) => `${i.code}:${i.message}:${JSON.stringify(i.path)}`
    );
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('sorts errors before warnings in the issue list', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], exclude: [], maxWarnings: -1 },
      mockContext()
    );

    const severities = result.report.issues.map((i) => i.severity);
    const firstWarningIdx = severities.indexOf('warning');
    const lastErrorIdx = severities.lastIndexOf('error');

    if (firstWarningIdx !== -1 && lastErrorIdx !== -1) {
      expect(lastErrorIdx).toBeLessThan(firstWarningIdx);
    }
  });
});

describe('validateConfiguration — file attribution', () => {
  it('sets the file field on issues when filePath is provided without fileContent', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], maxWarnings: -1 },
      mockContext(),
      '/project/ngcompass.config.ts'
    );

    for (const issue of result.report.issues) {
      expect(issue.file).toBe('/project/ngcompass.config.ts');
    }
  });
});

describe('validateConfiguration — schema errors', () => {
  it('surfaces a schema error when include is not an array', async () => {
    const result = await validateConfiguration(
      { include: 'src/**/*.ts' as any },
      mockContext()
    );

    expect(result.report.valid).toBe(false);
    expect(result.report.issues.length).toBeGreaterThan(0);
  });

  it('handles a completely empty config object without throwing', async () => {
    const result = await validateConfiguration({}, mockContext());

    expect(result.report).toBeDefined();
  });

  it('handles null / primitive inputs without throwing', async () => {
    await expect(
      validateConfiguration(null, mockContext())
    ).resolves.toBeDefined();
    await expect(
      validateConfiguration(42, mockContext())
    ).resolves.toBeDefined();
  });
});

describe('validateConfiguration — check isolation', () => {
  it('continues running remaining checks when one check encounters an unexpected error', async () => {
    let callCount = 0;
    const ctx = mockContext({
      fs: {
        existsSync: () => {
          callCount++;
          if (callCount === 1) throw new Error('Simulated fs crash');
          return true;
        },
        accessSync: () => undefined,
      },
    });

    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], outputPath: '/project/out' },
      ctx
    );

    expect(result.report).toBeDefined();

    const hasCrashIssue = result.report.issues.some(
      (i) => i.code === 'check-failed'
    );
    expect(hasCrashIssue).toBe(true);
  });
});

describe('validateCrossFields', () => {
  it('flags negative maxWarnings', () => {
    const config = mockConfig({ maxWarnings: -1 });
    const { issues } = validateCrossFields(config, mockContext());
    expect(issues.some((i) => i.code === 'negative-max-warnings')).toBe(true);
  });

  it('accepts zero maxWarnings', () => {
    const config = mockConfig({ maxWarnings: 0 });
    const { issues } = validateCrossFields(config, mockContext());
    expect(issues.some((i) => i.code === 'negative-max-warnings')).toBe(false);
  });

  it('flags negative maxWarnings in direct cross-field validation', () => {
    const config = mockConfig({ maxWarnings: -1 });
    const { issues } = validateCrossFields(config, mockContext());
    expect(issues.some((i) => i.code === 'negative-max-warnings')).toBe(true);
  });

  it('includes path prefix in issue paths when basePath is provided', () => {
    const config = mockConfig({ maxWarnings: -5 });
    const { issues } = validateCrossFields(config, mockContext(), [
      'profiles',
      'ci',
    ]);
    const issue = issues.find((i) => i.code === 'negative-max-warnings');
    expect(issue?.path).toEqual(['profiles', 'ci', 'maxWarnings']);
  });
});

describe('validatePaths', () => {
  it('flags outputPath containing path traversal sequences', () => {
    const config = mockConfig({ outputPath: '../outside/project' } as any);
    const { issues } = validatePaths(config, mockContext());
    expect(issues.some((i) => i.code === 'output-path-traversal')).toBe(true);
  });

  it('flags outputPath pointing to a sensitive system directory', () => {
    const config = mockConfig({ outputPath: '/etc/report' } as any);
    const { issues } = validatePaths(config, mockContext());
    expect(issues.some((i) => i.code === 'output-path-system-dir')).toBe(true);
  });

  it('flags outputPath whose parent directory does not exist', () => {
    const config = mockConfig({ outputPath: '/project/out/report' } as any);
    const ctx = mockContext({
      fs: { existsSync: () => false, accessSync: () => undefined },
    });
    const { issues } = validatePaths(config, ctx);
    expect(issues.some((i) => i.code === 'output-path-not-found')).toBe(true);
  });

  it('produces no issues for a valid, writable outputPath', () => {
    const config = mockConfig({ outputPath: '/project/reports' } as any);
    const { issues } = validatePaths(config, mockContext());
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('resolves relative outputPath directories against cwd', () => {
    const config = mockConfig({ outputPath: 'reports/ngcompass.html' } as any);
    const ctx = mockContext({
      cwd: '/project',
      fs: {
        existsSync: (p: string) => p === '/project/reports',
        accessSync: () => undefined,
      },
    });
    const { issues } = validatePaths(config, ctx);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('produces no issues when outputPath is absent', () => {
    const config = mockConfig();
    const { issues } = validatePaths(config, mockContext());
    expect(issues).toHaveLength(0);
  });
});
