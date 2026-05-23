/**
 * @fileoverview
 * Configuration initialization logic for the ngcompass CLI.
 *
 * Scaffolds a starter `ngcompass.config.ts` in the user's project directory,
 * populated with the default include/exclude glob patterns from
 * `@ngcompass/config` so the generated file always mirrors the runtime
 * defaults.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { InitResult } from '@ngcompass/common';
import { DEFAULT_CONFIG } from '../schemas/defaults.js';

/** Name of the scaffolded configuration file. */
const CONFIG_FILENAME = 'ngcompass.config.ts';

/**
 * Options accepted by {@link initConfig}.
 */
export interface InitOptions {
  /** Directory where the configuration file is written. Defaults to `process.cwd()`. */
  cwd?: string;
  /** When `true`, overwrites an existing configuration file. */
  force?: boolean;
}

/**
 * Renders a `defineConfig` template populated with the current runtime
 * defaults. Indentation and ordering are stable so the snapshot test in
 * `init.spec.ts` can pin the output verbatim.
 *
 * @returns {string} The TypeScript source of the starter configuration.
 */
const renderTemplate = (): string => {
  const includes = DEFAULT_CONFIG.include.map((p) => `    '${p}',`).join('\n');
  const excludes = DEFAULT_CONFIG.exclude.map((p) => `    '${p}',`).join('\n');

  return `import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  extends: 'ngcompass:recommended',

  include: [
${includes}
  ],

  exclude: [
${excludes}
  ],

  profiles: {
    ci: {
      outputFormat: 'json',
      maxWarnings: 0,
    },
  },
});
`;
};

/**
 * Checks whether the given path exists on disk without throwing.
 *
 * @param targetPath - Absolute filesystem path to probe.
 * @returns {Promise<boolean>} `true` when the path is accessible.
 */
const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Writes a starter ngcompass configuration file in the target directory.
 *
 * The function returns a structured {@link InitResult} for the two expected
 * domain outcomes (success, already-exists). Filesystem errors propagate so
 * the CLI's outer handler can surface a real diagnostic instead of a silent
 * `success: false`.
 *
 * @param options - Optional overrides for working directory and force-overwrite.
 * @returns {Promise<InitResult>} Outcome of the scaffold operation.
 * @throws {Error} When the underlying `fs.writeFile` call fails.
 *
 * @example
 *   const result = await initConfig({ cwd: '/path/to/project' });
 *   if (result.alreadyExists) { ... }
 */
export async function initConfig(
  options: InitOptions = {}
): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const filePath = path.join(cwd, CONFIG_FILENAME);

  if (!options.force && (await pathExists(filePath))) {
    return { success: false, filePath, alreadyExists: true };
  }

  await fs.writeFile(filePath, renderTemplate(), 'utf-8');
  return { success: true, filePath };
}
