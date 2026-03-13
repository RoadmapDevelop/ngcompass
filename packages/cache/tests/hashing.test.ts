import { describe, it, expect } from 'vitest';
import { initHasher, computeHash } from '../src/hashing.js';

describe('hashing', () => {
    it('uses sha256 fallback before async init', () => {
        const content = 'hello world';
        const hash = computeHash(content);
        
        // typical sha256 length is 64 hex characters
        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
    });

    it('uses xxhash after initialization', async () => {
        await initHasher();
        
        const content = 'hello world';
        const hash = computeHash(content);
        
        // typical xxhash length is 16 hex characters
        expect(hash).toBeDefined();
        expect(hash.length).toBe(16);
    });
});
