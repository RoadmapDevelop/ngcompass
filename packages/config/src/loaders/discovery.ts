import { lilconfig } from 'lilconfig';
import { createJiti } from 'jiti';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { debug, time, timeEnd } from '@ngcompass/common';

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
    return jiti.import(filepath).then((mod: unknown) => {
        // Handle export default vs export =
        if (mod && typeof mod === 'object' && 'default' in mod) {
            return (mod as { default: unknown }).default ?? mod;
        }
        return mod;
    });
};

const jsonLoader = (_filepath: string, content: string): unknown => JSON.parse(content.replace(/^\uFEFF/, ''));

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
    time('config-discovery');
    debug('discovery', `Searching for config in: ${cwd}`);

    const explorer = lilconfig(MODULE_NAME, {
        searchPlaces: SEARCH_PLACES,
        loaders: {
            '.ts': jitiLoader,
            '.js': jitiLoader,
            '.mjs': jitiLoader,
            '.cjs': jitiLoader,
            '.json': jsonLoader,
            noExt: jsonLoader
        }
    });

    const result = await explorer.search(cwd);

    if (!result) {
        debug('discovery', 'No config file found');
        timeEnd('config-discovery');
        return null;
    }

    debug('discovery', `Found config: ${result.filepath}`);

    let content = '';
    let contentHash = '';
    time('content-hash');
    try {
        content = fs.readFileSync(result.filepath, 'utf-8');
        contentHash = crypto.createHash('sha1').update(content).digest('hex');
        const hashTime = timeEnd('content-hash');
        debug('discovery', `Content hash: ${contentHash.substring(0, 8)}... (${hashTime.toFixed(1)}ms)`);
    } catch { /* ignore read error */ }

    const discoveryTime = timeEnd('config-discovery');
    debug('discovery', `Discovery complete: ${discoveryTime.toFixed(1)}ms`);

    return {
        config: result.config,
        filepath: result.filepath,
        content,
        contentHash,
        isEmpty: result.isEmpty
    };
};

