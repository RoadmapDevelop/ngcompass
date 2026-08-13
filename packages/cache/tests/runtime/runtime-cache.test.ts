import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as cacheModule from '../../src/index.js';

describe('runtime cache helpers', () => {
  it('creates a disk-backed runtime cache for local strategy', () => {
    const runtimeCache = cacheModule.createRuntimeCache(
      {
        cache: {
          enabled: true,
          location: '.cache/custom',
          strategy: 'local',
          ttl: 1234,
        },
      } as any,
      '/workspace'
    );

    expect(runtimeCache).toBeDefined();
    expect(runtimeCache?.getCachePath()).toBe(
      path.resolve('/workspace', '.cache/custom')
    );
  });

  it('creates a memory-only runtime cache for memory strategy', () => {
    const runtimeCache = cacheModule.createRuntimeCache(
      {
        cache: {
          enabled: true,
          location: '.cache/ignored-for-memory',
          strategy: 'memory',
          ttl: 555,
        },
      } as any,
      '/workspace'
    );

    expect(runtimeCache).toBeDefined();
    expect(runtimeCache?.getCachePath()).toBe('[memory]');
  });

  it('returns undefined when cache is disabled', () => {
    const result = cacheModule.createRuntimeCache(
      {
        cache: {
          enabled: false,
          location: '.cache/custom',
          strategy: 'local',
          ttl: 1234,
        },
      } as any,
      '/workspace'
    );

    expect(result).toBeUndefined();
  });
});
