import type { PresetConfig } from '../types.js';

/**
 * Security Preset
 *
 * Rules to prevent common security vulnerabilities like XSS.
 */
export const securityPreset: PresetConfig = {
    name: 'ngcompass:security',
    description: 'Rules for ensuring Angular application security',
    rules: {
        'no-inner-html': 'high',
        'no-bypass-security-trust': 'critical',
    },
};
