import { describe, it, expect } from 'vitest';
import { createPosition } from '@ngcompass/common';
import { core } from '@ngcompass/core';
import { rules } from '@ngcompass/rules';
import { reporters } from '@ngcompass/reporters';
import { cli } from '../src/index.js';

describe('CLI Setup', () => {
    it('should link to common', () => {
        expect(createPosition(1, 1)).toBeDefined();
    });
    it('should link to core', () => {
        expect(core).toBe('@ngcompass/core');
    });
    it('should link to rules', () => {
        expect(rules).toBe('@ngcompass/rules');
    });
    it('should link to reporters', () => {
        expect(reporters).toBe('@ngcompass/reporters');
    });
    it('should export self', () => {
        expect(cli).toBe('@ngcompass/cli');
    });
});
