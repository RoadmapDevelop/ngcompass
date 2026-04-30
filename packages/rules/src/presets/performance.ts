import { PresetConfig } from "@ngcompass/common";

/**
 * Performance Preset
 *
 * Targets rules that have a direct impact on rendering performance and
 * change-detection overhead. Combine with `ngcompass:recommended` for
 * full coverage.
 */
export const performancePreset: PresetConfig = {
    name: 'ngcompass:performance',
    description: 'Rules that directly impact Angular rendering and change-detection performance',
    rules: {
        // Change Detection
        'prefer-on-push-component-change-detection': 'error',
        'component-no-manual-detect-changes': 'error',

        // Template performance
        'template-no-call-expression': 'error',
        'template-trackby-required': 'error',
        'template-no-object-literal-binding': 'warn',
        'template-no-array-literal-binding': 'warn',
        'template-no-async-pipe-duplication': 'warn',
    },
};
