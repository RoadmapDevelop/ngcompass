import { describe, it, expect } from 'vitest';
import { createPosition } from '@ngcompass/common';
import { core } from '../src/index.js';

describe('Core Setup', () => {
    it('should link to common', () => {
        expect(createPosition(1, 1)).toBeDefined();
    });
    it('should export self', () => {
        expect(core).toBe('@ngcompass/core');
    });
});
