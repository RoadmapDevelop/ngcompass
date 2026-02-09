/**
 * Resource Discovery
 *
 * Pure functions for discovering related files (templates, styles, specs)
 * using convention-based detection (no parsing).
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { TaskInputs, FileInput } from './types.js';
import { getBaseName, isComponentFile } from './file-type.js';

/**
 * Discovers all related resources for a TypeScript file.
 * Uses naming conventions to find related files without parsing.
 *
 * @param tsFilePath - TypeScript file path (absolute)
 * @returns TaskInputs with all discovered resources
 */
export const discoverResources = async (
    tsFilePath: string,
    needsTsAst: boolean,
    needsHtmlAst: boolean,
    needsCssAst: boolean,
    needsSpecAst: boolean,
    directoryCache?: Map<string, string[]>
): Promise<TaskInputs> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    // Get files in directory (cached or fresh)
    let files: string[] = [];
    if (directoryCache?.has(dir)) {
        files = directoryCache.get(dir)!;
    } else {
        try {
            files = await readdir(dir);
            directoryCache?.set(dir, files);
        } catch {
            // Directory error (should not happen if ts file exists, but safe fallback)
            files = [];
        }
    }

    const hasFile = (name: string) => files.includes(name);

    // TypeScript file (always present)
    const typescript: FileInput = {
        path: tsFilePath,
        needsAst: needsTsAst,
        hash: ''
    };

    // Template file (for components/directives)
    const templateName = `${baseName}.component.html`;
    const templatePath = path.join(dir, templateName);
    const template: FileInput | undefined = hasFile(templateName)
        ? { path: templatePath, needsAst: needsHtmlAst, hash: '' }
        : undefined;

    // Style files (for components)
    const styles: FileInput[] = [];
    if (isComponentFile(tsFilePath)) {
        // Check for common style extensions
        const styleExtensions = ['.css', '.scss', '.sass', '.less'];
        for (const ext of styleExtensions) {
            const styleName = `${baseName}.component${ext}`;
            if (hasFile(styleName)) {
                styles.push({ path: path.join(dir, styleName), needsAst: needsCssAst, hash: '' });
            }
        }
    }

    // Spec file
    const specName = `${baseName}.spec.ts`;
    const specPath = path.join(dir, specName);
    const spec: FileInput | undefined = hasFile(specName)
        ? { path: specPath, needsAst: needsSpecAst, hash: '' }
        : undefined;

    return {
        typescript,
        template,
        styles: styles.length > 0 ? styles : undefined,
        spec,
    };
};

/**
 * Checks if any resource file exists for the given base path.
 *
 * @param tsFilePath - TypeScript file path
 * @param resourceType - Type of resource to check
 * @returns true if resource exists
 */
export const resourceExists = async (
    tsFilePath: string,
    resourceType: 'template' | 'style' | 'spec',
    directoryCache?: Map<string, string[]>
): Promise<boolean> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    let files: string[] = [];
    if (directoryCache?.has(dir)) {
        files = directoryCache.get(dir)!;
    } else {
        try {
            files = await readdir(dir);
            directoryCache?.set(dir, files);
        } catch {
            return false;
        }
    }

    const hasFile = (name: string) => files.includes(name);

    switch (resourceType) {
        case 'template': {
            return hasFile(`${baseName}.component.html`);
        }
        case 'style': {
            const styleExtensions = ['.css', '.scss', '.sass', '.less'];
            return styleExtensions.some((ext) => hasFile(`${baseName}.component${ext}`));
        }
        case 'spec': {
            return hasFile(`${baseName}.spec.ts`);
        }
    }
};

/**
 * Gets all style file paths for a component.
 *
 * @param tsFilePath - Component TypeScript file path
 * @returns Array of style file paths
 */
export const getStyleFiles = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>
): Promise<ReadonlyArray<string>> => {
    if (!isComponentFile(tsFilePath)) return [];

    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    let files: string[] = [];
    if (directoryCache?.has(dir)) {
        files = directoryCache.get(dir)!;
    } else {
        try {
            files = await readdir(dir);
            directoryCache?.set(dir, files);
        } catch {
            return [];
        }
    }

    const hasFile = (name: string) => files.includes(name);
    const styleExtensions = ['.css', '.scss', '.sass', '.less'];
    const styles: string[] = [];

    for (const ext of styleExtensions) {
        const styleName = `${baseName}.component${ext}`;
        if (hasFile(styleName)) {
            styles.push(path.join(dir, styleName));
        }
    }

    return styles;
};

/**
 * Gets the template file path for a component.
 *
 * @param tsFilePath - Component TypeScript file path
 * @returns Template file path or null if not found
 */
export const getTemplateFile = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>
): Promise<string | null> => {
    if (!isComponentFile(tsFilePath)) return null;

    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    let files: string[] = [];
    if (directoryCache?.has(dir)) {
        files = directoryCache.get(dir)!;
    } else {
        try {
            files = await readdir(dir);
            directoryCache?.set(dir, files);
        } catch {
            return null;
        }
    }

    const templateName = `${baseName}.component.html`;
    return files.includes(templateName) ? path.join(dir, templateName) : null;
};

/**
 * Gets the spec file path.
 *
 * @param tsFilePath - TypeScript file path
 * @returns Spec file path or null if not found
 */
export const getSpecFile = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>
): Promise<string | null> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    let files: string[] = [];
    if (directoryCache?.has(dir)) {
        files = directoryCache.get(dir)!;
    } else {
        try {
            files = await readdir(dir);
            directoryCache?.set(dir, files);
        } catch {
            return null;
        }
    }

    const specName = `${baseName}.spec.ts`;
    return files.includes(specName) ? path.join(dir, specName) : null;
};
