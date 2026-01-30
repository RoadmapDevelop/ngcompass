import { describe, it, expect } from 'vitest';
import { core } from '@ngcompass/core';
import { rules } from '../src/index.js';

describe('Rules Setup', () => {
    it('should link to core', () => {
        expect(core).toBe('@ngcompass/core');
    });
    it('should export self', () => {
        expect(rules).toBe('@ngcompass/rules');
    });
});
