/**
 * Preset Loader
 *
 * Loads preset configurations from built-in presets or file system
 */

import type { PresetConfig, PresetReference, Result } from '@ngcompass/common';
import { Ok, Err } from '@ngcompass/common';
import fs from 'fs/promises';
import path from 'path';
import { debug } from '@ngcompass/common';
import { isBuiltinPreset, getBuiltinPreset } from '../presets';

/**
 * Load a preset by reference
 *
 * Side effect: File I/O (isolated)
 */
export const loadPreset = async (
    reference: PresetReference,
    configDir: string = process.cwd()
): Promise<Result<PresetConfig>> => {
    debug('loader', `Loading preset: ${reference}`);

    // Built-in preset
    if (isBuiltinPreset(reference)) {
        const preset = getBuiltinPreset(reference);
        if (preset) {
            debug('loader', `Loaded built-in preset: ${reference}`);
            return Ok(preset);
        }
        return Err(new Error(`Built-in preset not found: ${reference}`));
    }

    // File-based preset
    try {
        const presetPath = path.resolve(configDir, reference);
        debug('loader', `Loading preset from file: ${presetPath}`);

        const content = await fs.readFile(presetPath, 'utf8');
        const preset = JSON.parse(content) as PresetConfig;

        debug('loader', `Loaded file-based preset: ${reference}`);
        return Ok(preset);
    } catch (error) {
        return Err(
            new Error(`Failed to load preset "${reference}": ${(error as Error).message}`)
        );
    }
};

/**
 * Resolve extends chain recursively
 *
 * Handles: "extends": "recommended"
 * Handles: "extends": ["recommended", "strict"]
 * Handles: Nested extends in presets
 *
 * Returns presets in order (deepest first)
 */
export const resolveExtendsChain = async (
    extendsValue: string | ReadonlyArray<string> | undefined,
    configDir: string,
    path: ReadonlyArray<string> = []
): Promise<Result<ReadonlyArray<PresetConfig>>> => {
    if (!extendsValue) {
        return Ok([]);
    }

    const references = Array.isArray(extendsValue) ? extendsValue : [extendsValue];
    const presets: PresetConfig[] = [];

    for (const reference of references) {
        // Detect circular extends by checking the current inheritance path
        if (path.includes(reference)) {
            const chain = [...path, reference].join(' -> ');
            return Err(new Error(`Circular extends detected: ${chain}`));
        }

        // Load preset
        const presetResult = await loadPreset(reference, configDir);
        if (!presetResult.ok) {
            return presetResult;
        }

        const preset = presetResult.data;

        // Recursively resolve preset's extends
        if (preset.extends) {
            const chainResult = await resolveExtendsChain(
                preset.extends,
                configDir,
                [...path, reference]
            );

            if (!chainResult.ok) {
                return chainResult;
            }

            // Add parent presets first (deeper first)
            presets.push(...chainResult.data);
        }

        // Add current preset
        presets.push(preset);
    }

    return Ok(presets);
};
