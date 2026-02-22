import { PresetConfig } from "../types.js";

/**
 * All Rules Preset
 *
 * Includes every available rule in the system.
 */
export const allPreset: PresetConfig = {
    name: 'ngcompass:all',
    description: 'All available rules enabled',
    rules: {
        'prefer-on-push-component-change-detection': 'high',
        'template-no-call-expression': 'high',
        'rxjs-no-subscribe-in-component': 'high',
    },
};
