import { PresetConfig } from "@ngcompass/common";

/**
 * Strict Preset
 */
export const strictPreset: PresetConfig = {
    name: 'ngcompass:strict',
    description: 'Strict architectural and performance rules',
    rules: {
        'prefer-on-push-component-change-detection': 'critical',
    },
};
