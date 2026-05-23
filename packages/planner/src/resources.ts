/**
 * @fileoverview
 * Per-file resource discovery used by the task-builder.
 *
 * Given a primary TypeScript file, returns the associated template, style,
 * and spec files via convention-based naming. Falls back to decorator-based
 * `templateUrl` / `styleUrls` extraction (shared with `component-graph.ts`)
 * when the conventional filenames are absent.
 *
 * Hash policy: the {@link TaskInputs} entries this module returns carry an
 * empty `hash` string. Hashes are computed later in `task-builder.ts` once
 * AST requirements are known so the same `discoverResources` call can be
 * shared across rules that need different `needsAst` flags.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { debug } from '@ngcompass/common';
import { extractStyleUrls, extractTemplateUrl } from './decorator-references.js';
import { getBaseName, isComponentFile } from './file-type.js';
import type { FileInput, TaskInputs } from './types.js';

const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'] as const;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Discovers every resource attached to `tsFilePath` (template, styles, spec).
 *
 * @param tsFilePath - TypeScript file path (absolute).
 * @param needsTsAst - Whether the TypeScript file's `FileInput` should request an AST.
 * @param needsHtmlAst - Same for the template.
 * @param needsCssAst - Same for style files.
 * @param needsSpecAst - Same for the spec file.
 * @param directoryCache - Optional directory listing cache shared across calls.
 * @returns A {@link TaskInputs} bundle with empty content hashes (filled later).
 */
export const discoverResources = async (
    tsFilePath: string,
    needsTsAst: boolean,
    needsHtmlAst: boolean,
    needsCssAst: boolean,
    needsSpecAst: boolean,
    directoryCache?: Map<string, string[]>,
): Promise<TaskInputs> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    const files = await listDirectory(dir, directoryCache);

    const typescript: FileInput = buildFileInput(tsFilePath, needsTsAst);

    let template = findTemplateFile(dir, baseName, files, needsHtmlAst);
    if (!template) {
        const extracted = await extractTemplateUrl(tsFilePath, dir);
        if (extracted) template = buildFileInput(extracted, needsHtmlAst);
    }

    let styles = findStyleFiles(tsFilePath, dir, baseName, files, needsCssAst);
    if (styles.length === 0 && isComponentFile(tsFilePath)) {
        const extracted = await extractStyleUrls(tsFilePath, dir);
        styles = extracted.map((p) => buildFileInput(p, needsCssAst));
    }

    const spec = findSpecFile(dir, baseName, files, needsSpecAst);

    return {
        typescript,
        template,
        styles: styles.length > 0 ? styles : undefined,
        spec,
    };
};

/**
 * Returns `true` when `tsFilePath` has a resource of the requested type.
 *
 * @param tsFilePath - TypeScript file path.
 * @param resourceType - Which resource family to probe.
 * @param directoryCache - Optional directory listing cache.
 */
export const resourceExists = async (
    tsFilePath: string,
    resourceType: 'template' | 'style' | 'spec',
    directoryCache?: Map<string, string[]>,
): Promise<boolean> => {
    const baseName = getBaseName(tsFilePath);
    const files = await listDirectory(path.dirname(tsFilePath), directoryCache);

    if (resourceType === 'template') return hasTemplateFile(baseName, files);
    if (resourceType === 'style') {
        if (!isComponentFile(tsFilePath)) return false;
        return hasAnyStyleFile(baseName, files);
    }
    return hasSpecFile(baseName, files);
};

/**
 * Returns every conventional style file for a component (CSS/SCSS/Sass/Less).
 */
export const getStyleFiles = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>,
): Promise<ReadonlyArray<string>> => {
    if (!isComponentFile(tsFilePath)) return [];

    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);
    const files = await listDirectory(dir, directoryCache);

    return STYLE_EXTENSIONS.flatMap((ext) => {
        const name = styleFileName(baseName, ext);
        return files.includes(name) ? [path.join(dir, name)] : [];
    });
};

/** Returns the conventional template path for a component, or `null`. */
export const getTemplateFile = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>,
): Promise<string | null> => {
    if (!isComponentFile(tsFilePath)) return null;
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);
    const files = await listDirectory(dir, directoryCache);
    const name = templateFileName(baseName);
    return files.includes(name) ? path.join(dir, name) : null;
};

/** Returns the conventional spec path for a TypeScript file, or `null`. */
export const getSpecFile = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>,
): Promise<string | null> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);
    const files = await listDirectory(dir, directoryCache);
    const name = specFileName(baseName);
    return files.includes(name) ? path.join(dir, name) : null;
};

// ── Internal helpers ──────────────────────────────────────────────────────

/** Lists directory contents, using the supplied cache when present. */
const listDirectory = async (
    dir: string,
    directoryCache?: Map<string, string[]>,
): Promise<string[]> => {
    const cached = directoryCache?.get(dir);
    if (cached) return cached;
    try {
        const files = await readdir(dir);
        directoryCache?.set(dir, files);
        return files;
    } catch (error) {
        debug(
            'planner',
            `Failed to read directory: ${dir}. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [];
    }
};

/**
 * Builds a placeholder `FileInput`. The `hash` is intentionally empty here;
 * `task-builder.ts` populates the real content hash after AST requirements
 * are resolved so the same `discoverResources` call can be reused across
 * rules with different `needsAst` flags.
 */
const buildFileInput = (filePath: string, needsAst: boolean): FileInput => ({
    path: filePath,
    needsAst,
    hash: '',
});

const templateFileName = (baseName: string): string => `${baseName}.component.html`;
const styleFileName = (baseName: string, ext: string): string => `${baseName}.component${ext}`;
const specFileName = (baseName: string): string => `${baseName}.spec.ts`;

const hasTemplateFile = (baseName: string, files: ReadonlyArray<string>): boolean =>
    files.includes(templateFileName(baseName));

const hasAnyStyleFile = (baseName: string, files: ReadonlyArray<string>): boolean =>
    STYLE_EXTENSIONS.some((ext) => files.includes(styleFileName(baseName, ext)));

const hasSpecFile = (baseName: string, files: ReadonlyArray<string>): boolean =>
    files.includes(specFileName(baseName));

const findTemplateFile = (
    dir: string,
    baseName: string,
    files: ReadonlyArray<string>,
    needsAst: boolean,
): FileInput | undefined => {
    const name = templateFileName(baseName);
    return files.includes(name) ? buildFileInput(path.join(dir, name), needsAst) : undefined;
};

const findStyleFiles = (
    tsFilePath: string,
    dir: string,
    baseName: string,
    files: ReadonlyArray<string>,
    needsAst: boolean,
): FileInput[] => {
    if (!isComponentFile(tsFilePath)) return [];
    const styles: FileInput[] = [];
    for (const ext of STYLE_EXTENSIONS) {
        const name = styleFileName(baseName, ext);
        if (files.includes(name)) {
            styles.push(buildFileInput(path.join(dir, name), needsAst));
        }
    }
    return styles;
};

const findSpecFile = (
    dir: string,
    baseName: string,
    files: ReadonlyArray<string>,
    needsAst: boolean,
): FileInput | undefined => {
    const name = specFileName(baseName);
    return files.includes(name) ? buildFileInput(path.join(dir, name), needsAst) : undefined;
};
