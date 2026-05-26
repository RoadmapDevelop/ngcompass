import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDiskDriver } from '../../src/drivers/disk.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('createDiskDriver', () => {
  const testDir = path.join(process.cwd(), '.test-cache-disk');

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('sets, gets, and deletes items asynchronously', async () => {
    const driver = createDiskDriver<{ key: string }>({ path: testDir });

    expect(await driver.get('foo')).toBeUndefined();

    await driver.set('foo', { key: 'value' });
    expect(await driver.has('foo')).toBe(true);

    const res = await driver.get('foo');
    expect(res).toEqual({ key: 'value' });

    await driver.delete('foo');
    expect(await driver.get('foo')).toBeUndefined();
    expect(await driver.has('foo')).toBe(false);
  });

  it('can clear all contents', async () => {
    const driver = createDiskDriver<number>({ path: testDir });
    await driver.set('a', 1);
    await driver.set('b', 2);

    expect(await driver.has('a')).toBe(true);

    await driver.clear();

    expect(await driver.has('a')).toBe(false);
    expect(await driver.has('b')).toBe(false);
  });

  it('recovers from ENOENT when asserting has() on missing dir', async () => {
    const driver = createDiskDriver<string>({ path: testDir });

    expect(await driver.has('missing')).toBe(false);
  });
});
