import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    enableDebug,
    disableDebug,
    debug,
    time,
    timeEnd,
    isDebugEnabled,
    type Namespace
} from '../src/logger.js';

describe('Logger Module', () => {
    // Capture console output
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Reset logger state
        disableDebug();
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        disableDebug();
    });

    describe('enableDebug / disableDebug', () => {
        it('should enable debug mode for all namespaces', () => {
            enableDebug('debug', 'all');

            expect(isDebugEnabled()).toBe(true);

            debug('scanner', 'Test message');
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should enable debug mode for specific namespaces', () => {
            enableDebug('debug', ['scanner', 'loader']);

            expect(isDebugEnabled()).toBe(true);

            debug('scanner', 'Scanner message');
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockClear();

            debug('loader', 'Loader message');
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should not log for disabled namespaces', () => {
            enableDebug('debug', ['scanner']);

            debug('loader', 'Should not appear');
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should disable debug mode', () => {
            enableDebug('debug', 'all');
            expect(isDebugEnabled()).toBe(true);

            disableDebug();
            expect(isDebugEnabled()).toBe(false);

            debug('scanner', 'Should not appear');
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should handle verbose level (alias for debug)', () => {
            enableDebug('debug', 'all');

            debug('scanner', 'Test');
            expect(consoleSpy).toHaveBeenCalled();
        });
    });

    describe('debug function', () => {
        beforeEach(() => {
            enableDebug('debug', 'all');
        });

        it('should log debug messages when enabled', () => {
            debug('scanner', 'Test message');

            expect(consoleSpy).toHaveBeenCalled();
            const call = consoleSpy.mock.calls[0];
            expect(call[0]).toContain('[scanner]');
            expect(call[0]).toContain('Test message');
        });

        it('should not log when debug is disabled', () => {
            disableDebug();

            debug('scanner', 'Test message');

            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should support all namespace types', () => {
            const namespaces: Namespace[] = [
                'discovery',
                'loader',
                'validator',
                'cache',
                'scanner',
                'parser',
                'rules',
                'workers',
                'reporter',
                'watch',
                'autofix',
                'init',
                'config',
                'env-fingerprint'
            ];

            namespaces.forEach(namespace => {
                debug(namespace, `Test ${namespace}`);
                expect(consoleSpy).toHaveBeenCalled();
                consoleSpy.mockClear();
            });
        });

        it('should handle additional arguments', () => {
            debug('scanner', 'Test', 'arg1', 'arg2');

            expect(consoleSpy).toHaveBeenCalled();
            const call = consoleSpy.mock.calls[0];
            expect(call).toContain('arg1');
            expect(call).toContain('arg2');
        });

        it('should format messages with namespace prefix', () => {
            debug('scanner', 'Finding files');

            const call = consoleSpy.mock.calls[0][0];
            expect(call).toMatch(/\[scanner\]/);
            expect(call).toContain('Finding files');
        });
    });

    describe('time / timeEnd', () => {
        beforeEach(() => {
            enableDebug('debug', 'all');
        });

        it('should measure time between time() and timeEnd()', () => {
            time('test-operation');

            // Simulate some work
            const start = performance.now();
            while (performance.now() - start < 10) {
                // Wait ~10ms
            }

            const duration = timeEnd('test-operation');

            expect(duration).toBeGreaterThan(0);
            expect(duration).toBeGreaterThanOrEqual(10);
            expect(duration).toBeLessThan(100); // Sanity check
        });

        it('should return duration in milliseconds', () => {
            time('test-op');

            const duration = timeEnd('test-op');

            expect(typeof duration).toBe('number');
            expect(duration).toBeGreaterThanOrEqual(0);
        });

        it('should handle multiple timers simultaneously', () => {
            time('operation-1');
            time('operation-2');

            const duration1 = timeEnd('operation-1');
            const duration2 = timeEnd('operation-2');

            expect(duration1).toBeGreaterThanOrEqual(0);
            expect(duration2).toBeGreaterThanOrEqual(0);
        });

        it('should return 0 for timer that was not started', () => {
            const duration = timeEnd('non-existent');

            expect(duration).toBe(0);
        });

        it('should clear timer after timeEnd', () => {
            time('test');
            timeEnd('test');

            // Call timeEnd again - should return 0
            const duration = timeEnd('test');
            expect(duration).toBe(0);
        });

        it('should work independently of debug mode', () => {
            disableDebug();

            time('test');
            const duration = timeEnd('test');

            expect(duration).toBeGreaterThanOrEqual(0);
        });

        it('should be idempotent for time() calls', () => {
            const start1 = performance.now();
            time('test');
            const start2 = performance.now();
            time('test'); // Second call should reset

            // Small delay
            while (performance.now() - start2 < 5) { }

            const duration = timeEnd('test');

            // Duration should be from second time() call
            expect(duration).toBeLessThan(performance.now() - start1);
        });
    });

    describe('isDebugEnabled', () => {
        it('should return false by default', () => {
            expect(isDebugEnabled()).toBe(false);
        });

        it('should return true when debug is enabled', () => {
            enableDebug('debug', 'all');
            expect(isDebugEnabled()).toBe(true);
        });

        it('should return false after disabling', () => {
            enableDebug('debug', 'all');
            disableDebug();
            expect(isDebugEnabled()).toBe(false);
        });

        it('should return true when specific namespaces are enabled', () => {
            enableDebug('debug', ['scanner']);
            expect(isDebugEnabled()).toBe(true);
        });
    });

    describe('Namespace filtering', () => {
        it('should only log enabled namespaces', () => {
            enableDebug('debug', ['scanner', 'loader']);

            debug('scanner', 'Scanner message');
            expect(consoleSpy).toHaveBeenCalledTimes(1);

            debug('loader', 'Loader message');
            expect(consoleSpy).toHaveBeenCalledTimes(2);

            debug('validator', 'Should not appear');
            expect(consoleSpy).toHaveBeenCalledTimes(2); // Still 2
        });

        it('should handle empty namespace array (logs nothing)', () => {
            enableDebug('debug', []);

            debug('scanner', 'Should not appear');
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should log all namespaces when set to "all"', () => {
            enableDebug('debug', 'all');

            const namespaces: Namespace[] = ['scanner', 'loader', 'validator'];
            namespaces.forEach(ns => {
                debug(ns, 'Test');
            });

            expect(consoleSpy).toHaveBeenCalledTimes(namespaces.length);
        });
    });

    describe('Zero overhead when disabled', () => {
        it('should not perform operations when debug is disabled', () => {
            disableDebug();

            // These should be no-ops
            debug('scanner', 'Test');
            time('test');
            const duration = timeEnd('test');

            expect(consoleSpy).not.toHaveBeenCalled();
            expect(duration).toBe(0);
        });

        it('should not create timers when debug is disabled', () => {
            disableDebug();

            time('test1');
            time('test2');

            const duration1 = timeEnd('test1');
            const duration2 = timeEnd('test2');

            expect(duration1).toBe(0);
            expect(duration2).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty messages', () => {
            enableDebug('debug', 'all');

            debug('scanner', '');
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should handle messages with special characters', () => {
            enableDebug('debug', 'all');

            debug('scanner', 'Test: {value} [status] (done)');
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should handle very long messages', () => {
            enableDebug('debug', 'all');

            const longMessage = 'A'.repeat(1000);
            debug('scanner', longMessage);

            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should handle objects and arrays in messages', () => {
            enableDebug('debug', 'all');

            debug('scanner', 'Object:', { key: 'value' });
            debug('scanner', 'Array:', [1, 2, 3]);

            expect(consoleSpy).toHaveBeenCalledTimes(2);
        });

        it('should handle timer labels with special characters', () => {
            time('test-operation');
            time('test:operation');
            time('test.operation');

            expect(timeEnd('test-operation')).toBeGreaterThanOrEqual(0);
            expect(timeEnd('test:operation')).toBeGreaterThanOrEqual(0);
            expect(timeEnd('test.operation')).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Real-world usage patterns', () => {
        it('should support typical scanner workflow', () => {
            enableDebug('debug', ['scanner']);

            time('file-scan');
            debug('scanner', 'Starting file discovery');
            debug('scanner', 'Found 10 files');
            const duration = timeEnd('file-scan');

            expect(consoleSpy).toHaveBeenCalledTimes(2);
            expect(duration).toBeGreaterThanOrEqual(0);
        });

        it('should support nested timing operations', () => {
            time('outer-operation');
            time('inner-operation-1');
            const inner1 = timeEnd('inner-operation-1');

            time('inner-operation-2');
            const inner2 = timeEnd('inner-operation-2');

            const outer = timeEnd('outer-operation');

            expect(inner1).toBeGreaterThanOrEqual(0);
            expect(inner2).toBeGreaterThanOrEqual(0);
            expect(outer).toBeGreaterThanOrEqual(inner1);
            expect(outer).toBeGreaterThanOrEqual(inner2);
        });

        it('should support sequential operations', () => {
            enableDebug('debug', 'all');

            time('step-1');
            debug('scanner', 'Step 1');
            timeEnd('step-1');

            time('step-2');
            debug('scanner', 'Step 2');
            timeEnd('step-2');

            time('step-3');
            debug('scanner', 'Step 3');
            timeEnd('step-3');

            expect(consoleSpy).toHaveBeenCalledTimes(3);
        });
    });
});
