import { describe, it, expect, vi } from 'vitest';
import { computeEnvFingerprint, buildEnvScopedKey } from '../src/env-fingerprint.js';

// We mock readPackageVersion indirectly by avoiding the actual node module read
// Though env-fingerprint has it internally closed over, the logic relies on try-catch.
// For realistic unmocked run, it reads existing pkgs or gracefully degrades to 'unknown'.
describe('env-fingerprint', () => {
    it('computes a consistent deterministic fingerprint', async () => {
        const fp1 = await computeEnvFingerprint();
        const fp2 = await computeEnvFingerprint();

        expect(fp1.value).toBeDefined();
        expect(fp1.value).toBe(fp2.value);
        expect(fp1.components).toBeDefined();
        expect(fp1.components.toolVersion).toBeDefined();
    });

    it('buildEnvScopedKey prefixes key with fingerprint value', async () => {
        const fp = await computeEnvFingerprint();
        const scoped = buildEnvScopedKey(fp, 'my-key');

        expect(scoped).toBe(`${fp.value}::my-key`);
        expect(scoped.includes('::')).toBe(true);
    });
});
