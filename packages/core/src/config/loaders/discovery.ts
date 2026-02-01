import { lilconfig } from 'lilconfig';
import { createJiti } from 'jiti';
import fs from 'node:fs';
import crypto from 'node:crypto';

const MODULE_NAME = 'ngcompass';

/**
 * List of file names to search for configuration.
 * Order matters: TS > JS > JSON > RC
 */
const SEARCH_PLACES = [
    `${MODULE_NAME}.config.ts`,
    `${MODULE_NAME}.config.js`,
    `${MODULE_NAME}.config.mjs`,
    `${MODULE_NAME}.config.cjs`,
    `${MODULE_NAME}.config.json`,
    `.${MODULE_NAME}rc`,
    `.${MODULE_NAME}rc.json`,
    'package.json'
];

/**
 * Default loader for TS/JS files using jiti.
 */
const jitiLoader = (filepath: string): Promise<unknown> => {
    const jiti = createJiti(process.cwd()); // Use cwd context
    return jiti.import(filepath).then((mod: any) => {
        // Handle export default vs export =
        return mod.default || mod;
    });
};

/**
 * Discovery result interface.
 */
export interface ConfigDiscoveryResult {
    config: unknown;
    filepath: string;
    content: string;
    contentHash: string;
    isEmpty?: boolean;
}

/**
 * Finds and loads the configuration file.
 */
export const findAndLoadConfig = async (cwd: string = process.cwd()): Promise<ConfigDiscoveryResult | null> => {
    const explorer = lilconfig(MODULE_NAME, {
        searchPlaces: SEARCH_PLACES,
        loaders: {
            '.ts': jitiLoader,
            '.js': jitiLoader,
            '.mjs': jitiLoader,
            '.cjs': jitiLoader
        }
    });

    const result = await explorer.search(cwd);

    if (!result) {
        return null;
    }

    let content = '';
    let contentHash = '';
    try {
        content = fs.readFileSync(result.filepath, 'utf-8');
        contentHash = crypto.createHash('sha1').update(content).digest('hex');
    } catch { /* ignore read error */ }

    return {
        config: result.config,
        filepath: result.filepath,
        content,
        contentHash,
        isEmpty: result.isEmpty
    };
};
