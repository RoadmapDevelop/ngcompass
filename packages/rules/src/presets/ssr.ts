import { PresetConfig } from "@ngcompass/common";

/**
 * SSR Preset
 *
 * Rules that ensure platform safety for Angular Universal and `@angular/ssr`
 * applications. Direct `document` access and lifecycle DOM access will throw
 * or produce broken output on the server where browser APIs are unavailable.
 *
 * Use alongside `ngcompass:recommended` for full coverage.
 */
export const ssrPreset: PresetConfig = {
    name: 'ngcompass:ssr',
    description: 'Platform safety rules for Angular SSR / Universal applications',
    rules: {
        'no-document-access': 'warn',
        'prefer-after-render-over-after-view-init': 'warn',
    },
};
