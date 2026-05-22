/**
 * @fileoverview
 * Shared regex-based extractors for `templateUrl` / `styleUrls` / `styleUrl`
 * references in Angular `@Component` source.
 *
 * The planner needs these references in two places:
 *  - `resources.ts` (per-file fallback when convention-based discovery misses).
 *  - `component-graph.ts` (one-pass graph build, also as a fallback).
 *
 * Centralizing the regexes here keeps the patterns in one place so a fix to
 * one extractor automatically benefits both call sites.
 *
 * Note: these are deliberately regex-based (not AST-based) because they run
 * during the planning phase BEFORE any TypeScript parse is performed.
 * Accuracy is good enough for convention-following code; rules that need
 * exhaustive coverage rely on the engine's full AST pass later.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATE_URL_RE = /templateUrl\s*:\s*['"`]([^'"`\n]+)['"`]/;
const STYLE_URL_RE = /\bstyleUrl(?!s)\s*:\s*['"`]([^'"`\n]+)['"`]/;
const STYLE_URLS_RE = /\bstyleUrls\s*:\s*\[([^\]]+)\]/;
const STYLE_STR_RE = /['"`]([^'"`\n]+\.(?:css|scss|sass|less))['"`]/g;

/**
 * Reads `tsPath` and returns the resolved `templateUrl` value when the file
 * declares one. Returns `undefined` when the file can't be read or doesn't
 * contain a `templateUrl: '...'` reference.
 *
 * When `fileSet` is supplied, the resolved path is only returned if it
 * exists in the set — useful for the component-graph builder where the
 * resolved file must already be a known project file.
 */
export const extractTemplateUrl = async (
    tsPath: string,
    dir: string,
    fileSet?: Set<string>,
): Promise<string | undefined> => {
    try {
        const content = await readFile(tsPath, 'utf-8');
        const match = TEMPLATE_URL_RE.exec(content);
        if (!match) return undefined;
        const resolved = path.resolve(dir, match[1]);
        if (fileSet && !fileSet.has(resolved)) return undefined;
        return resolved;
    } catch {
        return undefined;
    }
};

/**
 * Reads `tsPath` and returns the resolved `styleUrl` / `styleUrls` values
 * declared on the `@Component`. Returns an empty array on read failure or
 * when no style URLs are declared.
 *
 * When `fileSet` is supplied, only paths present in the set are returned.
 */
export const extractStyleUrls = async (
    tsPath: string,
    dir: string,
    fileSet?: Set<string>,
): Promise<string[]> => {
    try {
        const content = await readFile(tsPath, 'utf-8');
        const results: string[] = [];

        const singleMatch = STYLE_URL_RE.exec(content);
        if (singleMatch) {
            const resolved = path.resolve(dir, singleMatch[1]);
            if (!fileSet || fileSet.has(resolved)) results.push(resolved);
        }

        const arrayMatch = STYLE_URLS_RE.exec(content);
        if (arrayMatch) {
            STYLE_STR_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = STYLE_STR_RE.exec(arrayMatch[1])) !== null) {
                const resolved = path.resolve(dir, m[1]);
                if (!fileSet || fileSet.has(resolved)) results.push(resolved);
            }
        }

        return results;
    } catch {
        return [];
    }
};
