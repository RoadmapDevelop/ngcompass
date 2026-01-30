import { describe, it, expect } from 'vitest';
import { createPosition } from '@ngcompass/common';
import { reporters } from '../src/index.js';

describe('Reporters Setup', () => {
    it('should link to common', () => {
        expect(createPosition(1, 1)).toBeDefined();
    });
    it('should export self', () => {
        expect(reporters).toBe('@ngcompass/reporters');
    });
});
