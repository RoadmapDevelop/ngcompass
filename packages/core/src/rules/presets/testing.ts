import type { PresetConfig } from '../types.js';

/**
 * Testing Preset
 *
 * (Planned) Rules for Angular unit and integration tests.
 */
export const testingPreset: PresetConfig = {
    name: 'ngcompass:testing',
    description: 'Rules for high-quality Angular tests',
    rules: {
        // Roadmap: no-focused-tests, no-skipped-tests, etc.
    },
};
