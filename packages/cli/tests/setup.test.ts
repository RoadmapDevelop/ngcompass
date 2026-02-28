import { describe, it, expect } from 'vitest';
import { common } from '@ngcompass/common';
import { rules } from '@ngcompass/rules';
import { TextConfigReporter } from '@ngcompass/reporters';

describe('CLI Setup', () => {
    it('should link to common', () => {
        expect(common).toBe('@ngcompass/common');
    });
    it('should link to rules', () => {
        expect(rules).toBe('@ngcompass/rules');
    });
    it('should link to reporters', () => {
        expect(TextConfigReporter).toBeDefined();
    });
});
