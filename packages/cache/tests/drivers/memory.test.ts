import { describe, it, expect } from 'vitest';
import { createMemoryDriver } from '../../src/drivers/memory.js';

describe('createMemoryDriver', () => {
  it('sets, gets, and deletes items', () => {
    const driver = createMemoryDriver<string>();

    expect(driver.get('foo')).toBeUndefined();
    driver.set('foo', 'bar');
    expect(driver.get('foo')).toBe('bar');
    expect(driver.has('foo')).toBe(true);

    driver.delete('foo');
    expect(driver.get('foo')).toBeUndefined();
    expect(driver.has('foo')).toBe(false);
  });

  it('clears all items', () => {
    const driver = createMemoryDriver<number>();
    driver.set('a', 1);
    driver.set('b', 2);

    expect(driver.has('a')).toBe(true);
    driver.clear();
    expect(driver.has('a')).toBe(false);
    expect(driver.getStats().entries).toBe(0);
  });

  it('respects maxItems configuration', () => {
    const driver = createMemoryDriver<string>({ maxItems: 2 });
    driver.set('1', 'a');
    driver.set('2', 'b');
    driver.set('3', 'c');

    expect(driver.has('1')).toBe(false);
    expect(driver.has('2')).toBe(true);
    expect(driver.has('3')).toBe(true);
    expect(driver.getStats().entries).toBe(2);
  });
});
