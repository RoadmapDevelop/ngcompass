import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryDriver } from '../../../src/cache/drivers/memory.js';

describe('createMemoryDriver', () => {
    let driver: ReturnType<typeof createMemoryDriver<string>>;

    beforeEach(() => {
        driver = createMemoryDriver<string>({ maxItems: 10 });
    });

    it('should set and get values', () => {
        driver.set('key', 'value');
        expect(driver.get('key')).toBe('value');
    });

    it('should return undefined for missing keys', () => {
        expect(driver.get('missing')).toBeUndefined();
    });

    it('should evict items when maxItems is reached', () => {
        driver = createMemoryDriver<string>({ maxItems: 2 });
        driver.set('a', '1');
        driver.set('b', '2');
        driver.set('c', '3'); // Should evict 'a'

        expect(driver.get('a')).toBeUndefined();
        expect(driver.get('b')).toBe('2');
        expect(driver.get('c')).toBe('3');
    });

    it('should expire items after TTL', async () => {
        driver = createMemoryDriver<string>({ ttl: 10 }); // 10ms TTL
        driver.set('a', '1');

        expect(driver.get('a')).toBe('1');

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(driver.get('a')).toBeUndefined();
    });
});
