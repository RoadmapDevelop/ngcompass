import { describe, it, expect, afterEach, vi } from 'vitest';
import { createJsonFileDriver } from '../../src/drivers/json-file.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('createJsonFileDriver', () => {
    const testDir = path.join(process.cwd(), '.test-cache-json');
    
    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {}
    });

    it('queues writes and flushes them to disk', async () => {
        const driver = createJsonFileDriver<string>({ path: testDir });
        
        expect(await driver.get('key1')).toBeUndefined();
        
        await driver.set('key1', 'value1');
        await driver.set('key2', 'value2');
        
        expect(await driver.has('key1')).toBe(true);
        expect(await driver.get('key2')).toBe('value2');
        
        // Ensure flush writes file
        await driver.flush();
        const content = await fs.readFile(path.join(testDir, 'meta.json'), 'utf-8');
        expect(content).toContain('"key1":"value1"');
        expect(content).toContain('"key2":"value2"');
    });

    it('clears contents and deletes the file', async () => {
        const driver = createJsonFileDriver<number>({ path: testDir });
        await driver.set('num', 42);
        await driver.flush();
        
        await driver.clear();
        expect(await driver.get('num')).toBeUndefined();
        
        await expect(fs.access(path.join(testDir, 'meta.json'))).rejects.toThrow();
    });
});
