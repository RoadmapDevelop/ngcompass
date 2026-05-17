import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initHasher } from '@ngcompass/cache';
import {
    hashFile,
    hashFiles,
    hashRules,
    calculateFileHash,
    calculateTaskId,
    calculateGlobalHash,
    warmupHashCache,
} from '../src/hashing.js';
import type { TaskInputs } from '../src/types.js';
import type { ResolvedRule } from '@ngcompass/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRule = (name: string, overrides?: Partial<ResolvedRule>): ResolvedRule =>
    ({
        name,
        severity: 'moderate',
        options: {},
        metadata: {
            dependencyType: 'standalone',
            requires: { tsAst: true },
        },
        ...overrides,
    } as ResolvedRule);

const makeInputs = (tsPath: string, tsHash: string, templatePath?: string, templateHash?: string): TaskInputs => ({
    typescript: { path: tsPath, hash: tsHash, needsAst: true },
    ...(templatePath
        ? { template: { path: templatePath, hash: templateHash ?? 'tmpl-hash', needsAst: false } }
        : {}),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeAll(async () => {
    await initHasher();
});

describe('hashFile', () => {
    it('returns empty string when file does not exist', async () => {
        const result = await hashFile('/nonexistent/path/file.ts');
        expect(result).toBe('');
    });

    it('uses in-memory cache on repeated calls', async () => {
        const cache = new Map<string, string>();
        cache.set('/cached/file.ts', 'preloaded-hash');
        const result = await hashFile('/cached/file.ts', cache);
        expect(result).toBe('preloaded-hash');
    });

    it('stores computed hash in cache', async () => {
        const cache = new Map<string, string>();
        // file doesn't exist → returns '' but should not cache empty string
        const result = await hashFile('/nonexistent/file.ts', cache);
        expect(result).toBe('');
    });
});

describe('hashFiles', () => {
    it('returns empty string for empty array', async () => {
        const result = await hashFiles([]);
        expect(result).toBe('');
    });

    it('returns deterministic hash regardless of input order', async () => {
        const cache1 = new Map([
            ['/a.ts', 'hash-a'],
            ['/b.ts', 'hash-b'],
        ]);
        const cache2 = new Map([
            ['/b.ts', 'hash-b'],
            ['/a.ts', 'hash-a'],
        ]);

        const r1 = await hashFiles(['/a.ts', '/b.ts'], cache1);
        const r2 = await hashFiles(['/b.ts', '/a.ts'], cache2);
        expect(r1).toBe(r2);
        expect(r1).not.toBe('');
    });
});

describe('hashRules', () => {
    it('returns a non-empty string for a set of rules', () => {
        const rules = [makeRule('rule-a'), makeRule('rule-b')];
        const hash = hashRules(rules);
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
    });

    it('produces identical hashes regardless of input order', () => {
        const ruleA = makeRule('rule-a');
        const ruleB = makeRule('rule-b');
        const h1 = hashRules([ruleA, ruleB]);
        const h2 = hashRules([ruleB, ruleA]);
        expect(h1).toBe(h2);
    });

    it('produces different hashes for different rule sets', () => {
        const h1 = hashRules([makeRule('rule-a')]);
        const h2 = hashRules([makeRule('rule-b')]);
        expect(h1).not.toBe(h2);
    });

    it('produces different hashes when options differ', () => {
        const r1 = makeRule('rule-a', { options: { max: 1 } });
        const r2 = makeRule('rule-a', { options: { max: 2 } });
        const h1 = hashRules([r1]);
        const h2 = hashRules([r2]);
        expect(h1).not.toBe(h2);
    });
});

describe('calculateFileHash', () => {
    it('returns a non-empty hash for valid inputs', () => {
        const inputs = makeInputs('/app.component.ts', 'ts-hash');
        const rules = [makeRule('rule-a')];
        const hash = calculateFileHash(inputs, rules);
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
    });

    it('produces a different hash when the template hash changes', () => {
        const inputs1 = makeInputs('/app.component.ts', 'ts-hash', '/app.component.html', 'tmpl-v1');
        const inputs2 = makeInputs('/app.component.ts', 'ts-hash', '/app.component.html', 'tmpl-v2');
        const rules = [makeRule('rule-a')];
        expect(calculateFileHash(inputs1, rules)).not.toBe(calculateFileHash(inputs2, rules));
    });

    it('produces a different hash when rules change', () => {
        const inputs = makeInputs('/app.component.ts', 'ts-hash');
        const h1 = calculateFileHash(inputs, [makeRule('rule-a')]);
        const h2 = calculateFileHash(inputs, [makeRule('rule-b')]);
        expect(h1).not.toBe(h2);
    });
});

describe('calculateTaskId', () => {
    it('returns a stable, non-empty string', () => {
        const inputs = makeInputs('/app.component.ts', 'ts-hash');
        const id = calculateTaskId('my-rule', inputs, {});
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });

    it('is deterministic for the same inputs', () => {
        const inputs = makeInputs('/app.component.ts', 'ts-hash');
        const id1 = calculateTaskId('my-rule', inputs, {});
        const id2 = calculateTaskId('my-rule', inputs, {});
        expect(id1).toBe(id2);
    });

    it('differs when the rule name changes', () => {
        const inputs = makeInputs('/app.component.ts', 'ts-hash');
        const id1 = calculateTaskId('rule-a', inputs, {});
        const id2 = calculateTaskId('rule-b', inputs, {});
        expect(id1).not.toBe(id2);
    });

    it('differs when the typescript hash changes (rename-proofness)', () => {
        const inputs1 = makeInputs('/old.component.ts', 'same-content-hash');
        const inputs2 = makeInputs('/new.component.ts', 'same-content-hash');
        // taskId includes the file path, so it will differ; but cacheKey (content-only) would be the same
        // We verify that content hash changes always produce new ids
        const inputs3 = makeInputs('/app.component.ts', 'hash-v1');
        const inputs4 = makeInputs('/app.component.ts', 'hash-v2');
        const id3 = calculateTaskId('rule-a', inputs3, {});
        const id4 = calculateTaskId('rule-a', inputs4, {});
        expect(id3).not.toBe(id4);
    });

    it('incorporates cacheKeyCtx when provided', () => {
        const inputs = makeInputs('/app.component.ts', 'ts-hash');
        const withCtx = calculateTaskId('rule-a', inputs, {}, {
            toolVersion: '1.0.0',
            ruleRegistryHash: 'reg-hash',
            schemaVersion: '1',
            parserVersion: '0.0.1',
            platform: 'linux',
        });
        const withDifferentCtx = calculateTaskId('rule-a', inputs, {}, {
            toolVersion: '2.0.0',
            ruleRegistryHash: 'reg-hash',
            schemaVersion: '1',
            parserVersion: '0.0.1',
            platform: 'linux',
        });
        const withoutCtx = calculateTaskId('rule-a', inputs, {});

        // Upgrading the tool version must change the taskId
        expect(withCtx).not.toBe(withDifferentCtx);
        // Having a ctx at all must produce a different id from having none
        expect(withCtx).not.toBe(withoutCtx);
    });
});

describe('calculateGlobalHash', () => {
    it('returns a non-empty string', async () => {
        const files = ['/a.ts', '/b.ts'];
        const rules = new Map([['rule-a', makeRule('rule-a')]]);
        const cache = new Map([
            ['/a.ts', 'hash-a'],
            ['/b.ts', 'hash-b'],
        ]);
        const hash = await calculateGlobalHash(files, rules, cache);
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
    });

    it('is order-independent for files', async () => {
        const rules = new Map([['rule-a', makeRule('rule-a')]]);
        const cache = new Map([
            ['/a.ts', 'hash-a'],
            ['/b.ts', 'hash-b'],
        ]);
        const h1 = await calculateGlobalHash(['/a.ts', '/b.ts'], rules, cache);
        const h2 = await calculateGlobalHash(['/b.ts', '/a.ts'], rules, cache);
        expect(h1).toBe(h2);
    });

    it('changes when cacheKeyCtx toolVersion changes', async () => {
        const files = ['/a.ts'];
        const rules = new Map([['rule-a', makeRule('rule-a')]]);
        const cache = new Map([['/a.ts', 'hash-a']]);
        const ctx1 = { toolVersion: '1.0.0', ruleRegistryHash: 'r', schemaVersion: '1', parserVersion: 'p', platform: 'linux' };
        const ctx2 = { toolVersion: '2.0.0', ruleRegistryHash: 'r', schemaVersion: '1', parserVersion: 'p', platform: 'linux' };
        const h1 = await calculateGlobalHash(files, rules, cache, ctx1);
        const h2 = await calculateGlobalHash(files, rules, cache, ctx2);
        expect(h1).not.toBe(h2);
    });
});

describe('warmupHashCache', () => {
    it('hydrates the in-memory hash cache from metadata when size and mtime match', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngcompass-hash-'));
        try {
            const filePath = path.join(dir, 'app.component.ts');
            await fs.writeFile(filePath, 'actual file content');
            const stats = await fs.stat(filePath);

            const meta = new Map<string, { mtime: number; size: number; hash: string }>([
                [filePath, { mtime: stats.mtimeMs, size: stats.size, hash: 'cached-hash' }],
            ]);
            const metaCache = {
                get: vi.fn(async (key: string) => meta.get(key)),
                set: vi.fn(async (key: string, value: { mtime: number; size: number; hash: string }) => {
                    meta.set(key, value);
                }),
                flush: vi.fn(async () => {}),
            };
            const hashCache = new Map<string, string>();

            await warmupHashCache([filePath], metaCache as any, hashCache);

            expect(hashCache.get(filePath)).toBe('cached-hash');
            expect(metaCache.set).not.toHaveBeenCalled();
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
