import { describe, it, expect } from 'vitest';
import { validateExtendsChain } from '../src/health/checks/extends.js';
import type { ValidatedConfig } from '../src/health/types.js';

function withExtends(extendsValue: unknown): ValidatedConfig {
  return { extends: extendsValue } as ValidatedConfig;
}

describe('Check: Extends Chain Resolution', () => {
  describe('Empty & Missing States', () => {
    it('should return no issues when the extends field is missing', () => {
      const result = validateExtendsChain(
        {} as ValidatedConfig,
        [],
        process.cwd()
      );
      expect(result.issues).toHaveLength(0);
    });

    it('should return no issues when extends is an empty array', () => {
      const result = validateExtendsChain(withExtends([]), [], process.cwd());
      expect(result.issues).toHaveLength(0);
    });

    it('should ignore empty string entries without error', () => {
      const result = validateExtendsChain(withExtends(''), [], process.cwd());
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('Resolution Short-circuits', () => {
    it('should skip relative paths (./ or ../)', () => {
      const result = validateExtendsChain(
        withExtends(['./local-preset', '../shared/preset']),
        [],
        process.cwd()
      );
      expect(result.issues).toHaveLength(0);
    });

    it('should skip absolute filesystem paths', () => {
      const path =
        process.platform === 'win32'
          ? 'C:\\Config\\preset'
          : '/etc/ngcompass/preset';

      const result = validateExtendsChain(withExtends(path), [], process.cwd());
      expect(result.issues).toHaveLength(0);
    });

    it('should skip plugin-prefixed specifiers (plugin:*)', () => {
      const result = validateExtendsChain(
        withExtends('plugin:ngcompass/recommended'),
        [],
        process.cwd()
      );
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('npm Package Validation', () => {
    const missingPackage = '@not-installed/ngcompass-preset-xyz';

    it('should report an error for an unresolvable npm package', () => {
      const result = validateExtendsChain(
        withExtends(missingPackage),
        [],
        process.cwd()
      );

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('extends-not-found');
      expect(result.issues[0].severity).toBe('error');
    });

    it('should include the package name and install command in the feedback', () => {
      const result = validateExtendsChain(
        withExtends(missingPackage),
        [],
        process.cwd()
      );
      const issue = result.issues[0];

      expect(issue.message).toContain(missingPackage);
      expect(issue.suggestion).toContain('npm install');
      expect(issue.suggestion).toContain(missingPackage);
    });
  });

  describe('Path Attribution Logic', () => {
    it('should point directly to ["extends"] for a single string input', () => {
      const result = validateExtendsChain(
        withExtends('@missing/a'),
        [],
        process.cwd()
      );
      expect(result.issues[0].path).toEqual(['extends']);
    });

    it('should include the array index for multi-entry extends arrays', () => {
      const result = validateExtendsChain(
        withExtends(['@missing/c', '@missing/d']),
        [],
        process.cwd()
      );
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].path).toEqual(['extends', 0]);
      expect(result.issues[1].path).toEqual(['extends', 1]);
    });

    it('should prepend the basePath to the reported path', () => {
      const result = validateExtendsChain(
        withExtends('@missing/e'),
        ['profiles', 'ci'],
        process.cwd()
      );
      expect(result.issues[0].path).toEqual(['profiles', 'ci', 'extends']);
    });
  });
});
