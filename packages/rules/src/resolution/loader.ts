/**
 * @fileoverview
 * Preset loader.
 *
 * Resolves preset references (`'recommended'`, `'ngcompass:strict'`, a
 * filesystem path) to their `PresetConfig`, and walks any nested
 * `extends` chains while detecting circular dependencies.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
    debug,
    Err,
    Ok,
    type PresetConfig,
    type PresetReference,
    type Result,
} from '@ngcompass/common';
import { getBuiltinPreset, isBuiltinPreset } from '../presets/index.js';

/**
 * Loads a single preset by reference.
 *
 * Built-in presets resolve synchronously from the in-memory registry; any
 * other reference is treated as a JSON path resolved against `configDir`.
 */
export const loadPreset = async (
    reference: PresetReference,
    configDir: string,
): Promise<Result<PresetConfig>> => {
    debug('loader', `Loading preset: ${reference}`);

    if (isBuiltinPreset(reference)) {
        const preset = getBuiltinPreset(reference);
        if (preset) {
            debug('loader', `Loaded built-in preset: ${reference}`);
            return Ok(preset);
        }
        return Err(new Error(`Built-in preset not found: ${reference}`));
    }

    try {
        const presetPath = path.resolve(configDir, reference);
        debug('loader', `Loading preset from file: ${presetPath}`);
        const content = await readFile(presetPath, 'utf8');
        const preset = JSON.parse(content) as PresetConfig;
        debug('loader', `Loaded file-based preset: ${reference}`);
        return Ok(preset);
    } catch (error) {
        return Err(
            new Error(`Failed to load preset "${reference}": ${(error as Error).message}`),
        );
    }
};

/**
 * Recursively resolves a preset's `extends` chain.
 *
 * Returns presets in dependency order (deepest first, then the entry that
 * referenced them) so callers can merge configs left-to-right and have the
 * outermost preset win on collisions.
 *
 * @param extendsValue    - The current `extends` clause (string or array).
 * @param configDir       - Root used to resolve file-based references.
 * @param inheritancePath - Ancestor reference names visited so far. Used
 *                          for circular-extends detection; callers should
 *                          leave this at its default.
 */
export const resolveExtendsChain = async (
    extendsValue: string | ReadonlyArray<string> | undefined,
    configDir: string,
    inheritancePath: ReadonlyArray<string> = [],
): Promise<Result<ReadonlyArray<PresetConfig>>> => {
    if (!extendsValue) return Ok([]);

    const references = Array.isArray(extendsValue) ? extendsValue : [extendsValue];
    const presets: PresetConfig[] = [];

    for (const reference of references) {
        if (inheritancePath.includes(reference)) {
            const chain = [...inheritancePath, reference].join(' -> ');
            return Err(new Error(`Circular extends detected: ${chain}`));
        }

        const presetResult = await loadPreset(reference, configDir);
        if (!presetResult.ok) return presetResult;

        const preset = presetResult.data;

        if (preset.extends) {
            const chainResult = await resolveExtendsChain(
                preset.extends,
                configDir,
                [...inheritancePath, reference],
            );
            if (!chainResult.ok) return chainResult;
            presets.push(...chainResult.data);
        }

        presets.push(preset);
    }

    return Ok(presets);
};
