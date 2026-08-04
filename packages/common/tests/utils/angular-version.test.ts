import { describe, it, expect } from 'vitest';
import {
  formatAngularVersion,
  isAngularVersionBelow,
  parseAngularVersion,
} from '../../src/utils/angular-version.js';

describe('parseAngularVersion', () => {
  it('defaults a missing minor to zero', () => {
    expect(parseAngularVersion('17')).toEqual([17, 0]);
  });

  it('reads a major.minor version', () => {
    expect(parseAngularVersion('17.2')).toEqual([17, 2]);
  });

  it('discards the patch component of an installed version', () => {
    expect(parseAngularVersion('17.3.11')).toEqual([17, 3]);
  });

  it('discards a prerelease suffix', () => {
    expect(parseAngularVersion('18.0.0-next.5')).toEqual([18, 0]);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseAngularVersion('  17.2  ')).toEqual([17, 2]);
  });

  it('rejects range specifiers', () => {
    expect(parseAngularVersion('^17.2')).toBeNull();
    expect(parseAngularVersion('~17.2')).toBeNull();
    expect(parseAngularVersion('>=17')).toBeNull();
  });

  it('rejects non-numeric values', () => {
    expect(parseAngularVersion('v17')).toBeNull();
    expect(parseAngularVersion('latest')).toBeNull();
    expect(parseAngularVersion('')).toBeNull();
  });
});

describe('isAngularVersionBelow', () => {
  it('treats a lower major as below the floor', () => {
    expect(isAngularVersionBelow([16, 9], [17, 0])).toBe(true);
  });

  it('treats a lower minor within the same major as below the floor', () => {
    expect(isAngularVersionBelow([17, 0], [17, 1])).toBe(true);
  });

  it('treats an exact match as not below the floor', () => {
    expect(isAngularVersionBelow([17, 2], [17, 2])).toBe(false);
  });

  it('treats a higher version as not below the floor', () => {
    expect(isAngularVersionBelow([20, 0], [17, 2])).toBe(false);
  });

  it('compares minors numerically rather than lexically', () => {
    expect(isAngularVersionBelow([17, 10], [17, 9])).toBe(false);
  });
});

describe('formatAngularVersion', () => {
  it('renders a tuple as major.minor', () => {
    expect(formatAngularVersion([17, 2])).toBe('17.2');
  });
});
