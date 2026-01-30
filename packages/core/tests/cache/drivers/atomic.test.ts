import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAtomicDriver } from '../../../src/cache/drivers/atomic.js';
import path from 'path';
import fs from 'fs';

describe('createAtomicDriver', () => {
    const testPath = path.resolve(__dirname, '.atomic-test');
    let driver: ReturnType<typeof createAtomicDriver<object>>;

    beforeEach(() => {
        driver = createAtomicDriver({ path: testPath });
    });

    afterEach(() => {
        fs.rmSync(testPath, { recursive: true, force: true });
    });

    it('should write individual files', async () => {
        await driver.set('key1', { val: 1 });

        // Check direct file existence
        const filePath = path.join(testPath, 'key1.json');
        expect(fs.existsSync(filePath)).toBe(true);

        const result = await driver.get('key1');
        expect(result).toEqual({ val: 1 });
    });
});
