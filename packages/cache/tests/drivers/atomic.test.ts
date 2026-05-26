import { describe, it, expect, afterEach } from 'vitest';
import { createAtomicDriver } from '../../src/drivers/atomic.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('createAtomicDriver', () => {
  const testDir = path.join(process.cwd(), '.test-cache-atomic');

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('sets and gets distinct files per key safely', async () => {
    const driver = createAtomicDriver<{ name: string }>({ path: testDir });

    await driver.set('file1', { name: 'A' });
    await driver.set('file2', { name: 'B' });

    expect(await driver.get('file1')).toEqual({ name: 'A' });
    expect(await driver.has('file2')).toBe(true);
    expect(await driver.has('file3')).toBe(false);

    const files = await fs.readdir(testDir);
    expect(files).toContain('file1.json');
    expect(files).toContain('file2.json');
  });

  it('maintains the in-memory catalog for performance', async () => {
    const driver = createAtomicDriver<number>({ path: testDir });

    await driver.set('a', 1);
    await driver.delete('a');

    expect(await driver.has('a')).toBe(false);
    expect(await driver.get('a')).toBeUndefined();

    const files = await fs.readdir(testDir);
    expect(files.length).toBe(0);
  });

  it('can clear the entire directory and reset catalog', async () => {
    const driver = createAtomicDriver<string>({ path: testDir });
    await driver.set('z', 'hello');

    await driver.clear();
    expect(await driver.has('z')).toBe(false);

    const stats = await driver.getStats();
    expect(stats.entries).toBe(0);
  });
});
