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

export async function loadPreset(
  reference: PresetReference,
  configDir: string
): Promise<Result<PresetConfig>> {
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
      new Error(
        `Failed to load preset "${reference}": ${(error as Error).message}`
      )
    );
  }
}

export async function resolveExtendsChain(
  extendsValue: string | ReadonlyArray<string> | undefined,
  configDir: string,
  inheritancePath: ReadonlyArray<string> = []
): Promise<Result<ReadonlyArray<PresetConfig>>> {
  if (!extendsValue) return Ok([]);

  const references = Array.isArray(extendsValue)
    ? extendsValue
    : [extendsValue];
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
      const chainResult = await resolveExtendsChain(preset.extends, configDir, [
        ...inheritancePath,
        reference,
      ]);
      if (!chainResult.ok) return chainResult;
      presets.push(...chainResult.data);
    }

    presets.push(preset);
  }

  return Ok(presets);
}
