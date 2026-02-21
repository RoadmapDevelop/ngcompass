import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createJsonFileDriver } from '../../../src/cache/drivers/json-file.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ngcompass-json-file-test-'));
}

// ---------------------------------------------------------------------------
// createJsonFileDriver
// ---------------------------------------------------------------------------
describe('createJsonFileDriver', () => {
    let testPath: string;
    let driver: ReturnType<typeof createJsonFileDriver<unknown>>;

    beforeEach(() => {
        testPath = makeTmpDir();
        driver = createJsonFileDriver({ path: testPath });
    });

    afterEach(() => {
        fs.rmSync(testPath, { recursive: true, force: true });
    });

    // -----------------------------------------------------------------------
    // basic CRUD via in-memory cache
    // -----------------------------------------------------------------------
    it('set and get round-trip through in-memory cache', async () => {
        await driver.set('a', { x: 1 });
        expect(await driver.get('a')).toEqual({ x: 1 });
    });

    it('returns undefined for an unknown key', async () => {
        expect(await driver.get('missing')).toBeUndefined();
    });

    it('has() returns true for a stored key', async () => {
        await driver.set('b', 42);
        expect(await driver.has('b')).toBe(true);
    });

    it('has() returns false for a missing key', async () => {
        expect(await driver.has('ghost')).toBe(false);
    });

    it('delete() removes a key', async () => {
        await driver.set('c', 'hello');
        await driver.delete('c');
        expect(await driver.get('c')).toBeUndefined();
    });

    it('delete() is a no-op for an unknown key', async () => {
        await expect(driver.delete('nope')).resolves.toBeUndefined();
    });

    it('clear() empties the in-memory store', async () => {
        await driver.set('p', 1);
        await driver.set('q', 2);
        await driver.clear();
        expect(await driver.get('p')).toBeUndefined();
        expect(await driver.get('q')).toBeUndefined();
    });

    it('can set new values after clear()', async () => {
        await driver.set('old', 1);
        await driver.clear();
        await driver.set('new', 99);
        expect(await driver.get('new')).toBe(99);
    });

    // -----------------------------------------------------------------------
    // flush — ensures data is persisted to disk
    // -----------------------------------------------------------------------
    it('flush() writes data to disk as a JSON file', async () => {
        await driver.set('flushed', { saved: true });
        await driver.flush();
        const metaFile = path.join(testPath, 'meta.json');
        expect(fs.existsSync(metaFile)).toBe(true);
        const content = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        expect(content['flushed']).toEqual({ saved: true });
    });

    it('flush() on an empty (but loaded) cache writes an empty JSON object', async () => {
        await driver.get('trigger-load'); // forces load
        await driver.flush();
        const metaFile = path.join(testPath, 'meta.json');
        expect(fs.existsSync(metaFile)).toBe(true);
        expect(JSON.parse(fs.readFileSync(metaFile, 'utf-8'))).toEqual({});
    });

    it('flush() before any operation is a no-op (cache not loaded)', async () => {
        // Should not throw even though internal cache is null
        await expect(driver.flush()).resolves.toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // persistence across driver instances
    // -----------------------------------------------------------------------
    it('data persisted by flush() is readable by a new driver instance', async () => {
        await driver.set('persist', { value: 'hello' });
        await driver.flush();

        // New driver pointing at same directory
        const driver2 = createJsonFileDriver({ path: testPath });
        expect(await driver2.get('persist')).toEqual({ value: 'hello' });
    });

    // -----------------------------------------------------------------------
    // getStats
    // -----------------------------------------------------------------------
    it('getStats() reports the number of entries in memory', async () => {
        await driver.set('s1', 1);
        await driver.set('s2', 2);
        const stats = await driver.getStats();
        expect(stats.entries).toBe(2);
    });
});
