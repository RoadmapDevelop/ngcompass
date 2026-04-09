import { describe, it, expect } from 'vitest';
import { buildCacheKeyContext, serializeCacheKeyContext } from '../src/key-context.js';
import { PACKAGE_VERSION } from '@ngcompass/common';
import { CACHE_VERSION } from '../src/constants.js';

// The key context combines env fingerprint concepts with rule fingerprints.
// In the current implementation, it's generated once per process.
describe('CacheKeyContext', () => {
    it('builds a stable execution context', () => {
        const rules = ['rule-a', 'rule-b'];
        const rules2 = ['rule-b', 'rule-a'];
        
        const ctx1 = buildCacheKeyContext(rules);
        const ctx2 = buildCacheKeyContext(rules2);

        // Sorting should yield the same registry hash
        expect(ctx1.ruleRegistryHash).toBe(ctx2.ruleRegistryHash);
        
        // Assert other static defaults
        expect(ctx1.toolVersion).toBe(PACKAGE_VERSION);
        expect(ctx1.schemaVersion).toBe(CACHE_VERSION);
        expect(ctx1.platform).toBe(process.platform);
        expect(typeof ctx1.parserVersion).toBe('string');
    });

    it('serializes context predictably', () => {
        const ctx = buildCacheKeyContext(['rule-1']);
        const serialized = serializeCacheKeyContext(ctx);

        const expectedRegex = new RegExp(`^${PACKAGE_VERSION}::${CACHE_VERSION}::.*::.*::${process.platform}$`);
        expect(serialized).toMatch(expectedRegex);
    });
});
