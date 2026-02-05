/**
 * Resource Discovery
 *
 * Pure functions for discovering related files (templates, styles, specs)
 * using convention-based detection (no parsing).
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import type { TaskInputs, FileInput } from './types.js';
import { getBaseName, isComponentFile } from './file-type.js';

/**
 * Discovers all related resources for a TypeScript file.
 * Uses naming conventions to find related files without parsing.
 *
 * @param tsFilePath - TypeScript file path (absolute)
 * @returns TaskInputs with all discovered resources
 */
export const discoverResources = (
    tsFilePath: string,
    needsTsAst: boolean,
    needsHtmlAst: boolean,
    needsCssAst: boolean,
    needsSpecAst: boolean
): TaskInputs => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    // TypeScript file (always present)
    const typescript: FileInput = {
        path: tsFilePath,
        needsAst: needsTsAst,
        hash: ''
    };

    // Template file (for components/directives)
    const templatePath = path.join(dir, `${baseName}.component.html`);
    const template: FileInput | undefined = existsSync(templatePath)
        ? { path: templatePath, needsAst: needsHtmlAst, hash: '' }
        : undefined;

    // Style files (for components)
    const styles: FileInput[] = [];
    if (isComponentFile(tsFilePath)) {
        // Check for common style extensions
        const styleExtensions = ['.css', '.scss', '.sass', '.less'];
        for (const ext of styleExtensions) {
            const stylePath = path.join(dir, `${baseName}.component${ext}`);
            if (existsSync(stylePath)) {
                styles.push({ path: stylePath, needsAst: needsCssAst, hash: '' });
            }
        }
    }

    // Spec file
    const specPath = path.join(dir, `${baseName}.spec.ts`);
    const spec: FileInput | undefined = existsSync(specPath)
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
export const resourceExists = (
    tsFilePath: string,
    resourceType: 'template' | 'style' | 'spec'
): boolean => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    switch (resourceType) {
        case 'template': {
            const templatePath = path.join(dir, `${baseName}.component.html`);
            return existsSync(templatePath);
        }
        case 'style': {
            const styleExtensions = ['.css', '.scss', '.sass', '.less'];
            return styleExtensions.some((ext) => {
                const stylePath = path.join(dir, `${baseName}.component${ext}`);
                return existsSync(stylePath);
            });
        }
        case 'spec': {
            const specPath = path.join(dir, `${baseName}.spec.ts`);
            return existsSync(specPath);
        }
    }
};

/**
 * Gets all style file paths for a component.
 *
 * @param tsFilePath - Component TypeScript file path
 * @returns Array of style file paths
 */
export const getStyleFiles = (tsFilePath: string): ReadonlyArray<string> => {
    if (!isComponentFile(tsFilePath)) return [];

    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);
    const styleExtensions = ['.css', '.scss', '.sass', '.less'];
    const styles: string[] = [];

    for (const ext of styleExtensions) {
        const stylePath = path.join(dir, `${baseName}.component${ext}`);
        if (existsSync(stylePath)) {
            styles.push(stylePath);
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
export const getTemplateFile = (tsFilePath: string): string | null => {
    if (!isComponentFile(tsFilePath)) return null;

    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);
    const templatePath = path.join(dir, `${baseName}.component.html`);

    return existsSync(templatePath) ? templatePath : null;
};

/**
 * Gets the spec file path.
 *
 * @param tsFilePath - TypeScript file path
 * @returns Spec file path or null if not found
 */
export const getSpecFile = (tsFilePath: string): string | null => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);
    const specPath = path.join(dir, `${baseName}.spec.ts`);

    return existsSync(specPath) ? specPath : null;
};
