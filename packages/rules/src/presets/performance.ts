import { PresetConfig } from "@ngcompass/common";

/**
 * Performance Preset
 */
export const performancePreset: PresetConfig = {
    name: 'ngcompass:performance',
    description: 'Rules for optimizing Angular application performance',
    rules: {
        'prefer-on-push-component-change-detection': 'high',
    },
};
