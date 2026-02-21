import type { PresetConfig } from '../types.js';

/**
 * Accessibility Preset
 *
 * (Planned) Rules for ensuring Angular templates are accessible.
 */
export const accessibilityPreset: PresetConfig = {
    name: 'ngcompass:accessibility',
    description: 'Rules for ensuring template accessibility (A11y)',
    rules: {
        // Roadmap: template-accessibility-alt-text, template-no-autofocus, etc.
    },
};
