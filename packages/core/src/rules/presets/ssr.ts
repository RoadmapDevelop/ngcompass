import type { PresetConfig } from '../types.js';

/**
 * SSR Preset
 *
 * (Planned) Rules for Angular Universal / SSR compatibility.
 */
export const ssrPreset: PresetConfig = {
    name: 'ngcompass:ssr',
    description: 'Rules for SSR and Angular Universal compatibility',
    rules: {
        // Roadmap: no-window-reference, no-document-reference, etc.
    },
};
