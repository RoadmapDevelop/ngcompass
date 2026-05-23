/**
 * @fileoverview
 * Locates and loads the user's ngcompass configuration file.
 *
 * Uses `lilconfig` to walk the standard search places (TS → JS → JSON → RC →
 * `package.json["ngcompass"]`) and `jiti` to evaluate TS/JS configs without
 * requiring the host project to transpile them first. The `@ngcompass/config`
 * specifier is aliased to this package's own entry point so `defineConfig`
 * imports inside the user's config resolve correctly regardless of which
 * `node_modules` layout the tool runs from.
 *
 * Always returns the raw on-disk content plus a SHA-1 digest so downstream
 * caching can key results by exact file bytes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { lilconfig } from 'lilconfig';
import { debug, time, timeEnd } from '@ngcompass/common';
import { sha1Hex } from '../utils/hash.js';

const MODULE_NAME = 'ngcompass';

/** Configuration filenames searched in priority order. */
const SEARCH_PLACES = [
    `${MODULE_NAME}.config.ts`,
    `${MODULE_NAME}.config.js`,
    `${MODULE_NAME}.config.mjs`,
    `${MODULE_NAME}.config.cjs`,
    `${MODULE_NAME}.config.json`,
    `.${MODULE_NAME}rc`,
    `.${MODULE_NAME}rc.json`,
    'package.json',
];

/**
 * Jiti-backed loader for TS/JS configs.
 *
 * Aliases `@ngcompass/config` to this package's own entry point so the
 * user's `import { defineConfig } from '@ngcompass/config'` resolves even
 * when the tool runs from a non-project `node_modules` directory (e.g. a
 * pnpm-linked global install).
 */
const jitiLoader = (filepath: string): Promise<unknown> => {
    const currentFile = fileURLToPath(import.meta.url);
    const configPackageEntry = path.basename(currentFile).startsWith('index.')
        ? currentFile
        : fileURLToPath(new URL('../index.ts', import.meta.url));
    const jiti = createJiti(filepath, {
        alias: { '@ngcompass/config': configPackageEntry },
    });
    return jiti.import(filepath).then((mod: unknown) => {
        if (mod && typeof mod === 'object' && 'default' in mod) {
            return (mod as { default: unknown }).default ?? mod;
        }
        return mod;
    });
};

/** JSON loader that tolerates a leading byte-order mark. */
const jsonLoader = (_filepath: string, content: string): unknown =>
    JSON.parse(content.replace(/^\uFEFF/, ''));

/** Outcome of a successful discovery. */
export interface ConfigDiscoveryResult {
    config: unknown;
    filepath: string;
    content: string;
    contentHash: string;
    isEmpty?: boolean;
}

/**
 * Searches for and loads the ngcompass configuration from `cwd`.
 *
 * @param cwd - Project directory to search from.
 * @returns {Promise<ConfigDiscoveryResult | null>} Result, or `null` when no
 *          configuration file was found.
 */
export const findAndLoadConfig = async (cwd: string): Promise<ConfigDiscoveryResult | null> => {
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
            noExt: jsonLoader,
        },
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
        contentHash = sha1Hex(content);
        const hashTime = timeEnd('content-hash');
        debug('discovery', `Content hash: ${contentHash.substring(0, 8)}... (${hashTime.toFixed(1)}ms)`);
    } catch (err) {
        // lilconfig already parsed the file; a subsequent read failure here
        // is rare (permissions race, file removed mid-resolution). Log so
        // operators can spot the cause instead of debugging a stale cache.
        timeEnd('content-hash');
        const message = err instanceof Error ? err.message : String(err);
        debug('discovery', `Failed to re-read config file for hashing: ${message}`);
    }

    const discoveryTime = timeEnd('config-discovery');
    debug('discovery', `Discovery complete: ${discoveryTime.toFixed(1)}ms`);

    return {
        config: result.config,
        filepath: result.filepath,
        content,
        contentHash,
        isEmpty: result.isEmpty,
    };
};
