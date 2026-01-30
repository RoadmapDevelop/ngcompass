import { describe, it, expect } from 'vitest';
import { computeCompositeHash } from '../../../src/cache/services/hashing.js';

describe('computeCompositeHash', () => {
    it('should generate stable hashes', () => {
        const hash1 = computeCompositeHash('content');
        const hash2 = computeCompositeHash('content');
        expect(hash1).toBe(hash2);
    });

    it('should change hash when content changes', () => {
        const hash1 = computeCompositeHash('content1');
        const hash2 = computeCompositeHash('content2');
        expect(hash1).not.toBe(hash2);
    });

    it('should include salt in hash', () => {
        const hash1 = computeCompositeHash('content', 'salt1');
        const hash2 = computeCompositeHash('content', 'salt2');
        expect(hash1).not.toBe(hash2);
    });
});
