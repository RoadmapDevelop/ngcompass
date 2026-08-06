import { describe, it, expect } from 'vitest';
import { validateConfiguration } from '../src/health/validator.js';
import type { ValidationContext } from '../src/health/types.js';

function createContext(): ValidationContext {
  return {
    cwd: '/mock/project',
    fs: {
      existsSync: () => true,
      accessSync: () => {},
    },
    os: {
      cpus: () => [{ model: 'cpu-0' }, { model: 'cpu-1' }],
    },
    path: {
      dirname: (p: string) => {
        const normalized = p.replace(/\\/g, '/');
        const lastIndex = normalized.lastIndexOf('/');
        return lastIndex <= 0 ? '/' : normalized.slice(0, lastIndex);
      },
      resolve: (...parts: string[]) =>
        parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
      isAbsolute: (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p),
    },
  };
}

describe('angularVersion config validation', () => {
  it('accepts a major.minor version', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], angularVersion: '17.2' },
      createContext()
    );

    expect(result.report.valid).toBe(true);
    expect(result.config?.angularVersion).toBe('17.2');
  });

  it('accepts a bare major version', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], angularVersion: '18' },
      createContext()
    );

    expect(result.report.valid).toBe(true);
  });

  it('rejects a caret range as a hard error', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], angularVersion: '^17' },
      createContext()
    );

    expect(result.report.valid).toBe(false);
    expect(result.config).toBeUndefined();
    expect(
      result.report.issues.some((i) => i.code === 'invalid-angular-version')
    ).toBe(true);
  });

  it('rejects a non-numeric version as a hard error', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'], angularVersion: 'latest' },
      createContext()
    );

    expect(result.report.valid).toBe(false);
  });

  it('defaults angularVersion to null when the field is absent', async () => {
    const result = await validateConfiguration(
      { include: ['src/**/*.ts'] },
      createContext()
    );

    expect(result.report.valid).toBe(true);
    expect(result.config?.angularVersion).toBeNull();
  });
});
