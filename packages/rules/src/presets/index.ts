/**
 * @fileoverview
 * Built-in preset registry.
 *
 * Maps every shipped preset name to its `PresetConfig` so callers can ask
 * "is this a built-in preset?" / "give me the rules for `recommended`"
 * without hand-rolling a switch. References can be written with or
 * without the `ngcompass:` prefix; both forms resolve to the same entry.
 */

import type { BuiltinPreset, PresetConfig } from '@ngcompass/common';
import { allPreset } from './all.js';
import { performancePreset } from './performance.js';
import { reactivityPreset } from './reactivity.js';
import { recommendedPreset } from './recommended.js';
import { securityPreset } from './security.js';
import { ssrPreset } from './ssr.js';
import { strictPreset } from './strict.js';

/** Canonical map of preset name → config. */
export const builtinPresets: ReadonlyMap<BuiltinPreset, PresetConfig> = new Map([
    ['recommended', recommendedPreset],
    ['strict', strictPreset],
    ['performance', performancePreset],
    ['reactivity', reactivityPreset],
    ['security', securityPreset],
    ['ssr', ssrPreset],
    ['all', allPreset],
]);

/** Strips the `ngcompass:` prefix when present. Idempotent. */
const stripPrefix = (name: string): BuiltinPreset =>
    name.replace(/^ngcompass:/, '') as BuiltinPreset;

/** Returns `true` when `name` (with or without `ngcompass:` prefix) is built-in. */
export const isBuiltinPreset = (name: string): boolean =>
    builtinPresets.has(stripPrefix(name));

/** Returns the `PresetConfig` for `name`, or `undefined` when unknown. */
export const getBuiltinPreset = (name: string): PresetConfig | undefined =>
    builtinPresets.get(stripPrefix(name));

/** Returns every preset name that lists `ruleName` in its rules block. */
export function getPresetsForRule(ruleName: string): string[] {
    const result: string[] = [];
    for (const [presetName, preset] of builtinPresets) {
        if (ruleName in preset.rules) result.push(presetName);
    }
    return result;
}
