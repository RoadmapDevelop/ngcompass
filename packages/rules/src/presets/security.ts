import { PresetConfig } from "@ngcompass/common";

/**
 * Security Preset
 *
 * Rules that prevent XSS and sanitization bypass vulnerabilities.
 * Both rules are set to `error` — security violations should always
 * block CI regardless of team preferences.
 *
 * These rules are also included in `ngcompass:recommended`. This preset
 * exists as a standalone named target for security audits and for teams
 * that want to layer security checks on top of a custom base config.
 */
export const securityPreset: PresetConfig = {
    name: 'ngcompass:security',
    description: 'XSS and sanitization bypass prevention rules',
    rules: {
        'no-bypass-sanitization': 'error',
        'template-no-unsafe-bindings': 'error',
    },
};
