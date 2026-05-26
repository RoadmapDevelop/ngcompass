import fs from 'node:fs/promises';
import path from 'node:path';
import type { InitResult } from '@ngcompass/common';
import { DEFAULT_CONFIG } from '../schemas/defaults.js';

const CONFIG_FILENAME = 'ngcompass.config.ts';

export interface InitOptions {
  cwd?: string;

  force?: boolean;
}










export const renderConfigTemplate = (): string => {
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

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export async function initConfig(
  options: InitOptions = {}
): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const filePath = path.join(cwd, CONFIG_FILENAME);

  if (!options.force && (await pathExists(filePath))) {
    return { success: false, filePath, alreadyExists: true };
  }

  await fs.writeFile(filePath, renderConfigTemplate(), 'utf-8');
  return { success: true, filePath };
}
