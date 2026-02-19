import { describe, it, expect } from 'vitest';
import { common } from '@ngcompass/common';
import { core } from '@ngcompass/core';
import { rules } from '@ngcompass/rules';
import { TextConfigReporter } from '@ngcompass/reporters';

describe('CLI Setup', () => {
    it('should link to common', () => {
        expect(common).toBe('@ngcompass/common');
    });
    it('should link to core', () => {
        expect(core).toBe('@ngcompass/core');
    });
    it('should link to rules', () => {
        expect(rules).toBe('@ngcompass/rules');
    });
    it('should link to reporters', () => {
        expect(TextConfigReporter).toBeDefined();
    });
});
