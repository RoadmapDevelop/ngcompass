import { describe, it, expect } from 'vitest';
import { parseTs } from '../../src/parsers/ts.js';

describe('parseTs', () => {
    it('parses valid typescript code', () => {
        const result = parseTs('const x: number = 10;', 'test.ts');
        expect(result.errors.length).toBe(0);
        expect(result.program).toBeDefined();
        expect(result.program.type).toBe('Program');
    });

    it('captures parsing errors for invalid ts', () => {
        const result = parseTs('const class class = ;', 'test.ts');
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
