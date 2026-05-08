/**
 * File Type Detection
 *
 * Pure functions for detecting Angular file types based on naming conventions.
 * Follows FP principles: pure, deterministic, no side effects.
 */

import path from 'node:path';
import type { FileType } from './types.js';

/**
 * Matches an Angular class decorator at the start of a decorator expression.
 * Used for Level-2 content-based classification of plain `.ts` files that do
 * not follow Angular naming conventions (e.g. library-style `button.ts`).
 */
export const ANGULAR_DECORATOR_RE = /\@(Component|Directive|Pipe|Injectable|NgModule)\s*[\(\{]/;

/**
 * Detects file type based on file path and naming conventions.
 *
 * Convention rules:
 * - *.component.ts → component
 * - *.directive.ts → directive
 * - *.pipe.ts → pipe
 * - *.service.ts → service
 * - *.module.ts → module
 * - *.guard.ts → guard
 * - *.html → template
 * - *.css, *.scss, *.sass, *.less → style
 * - *.config.ts, *.json → config
 * - *.ts (other TypeScript) → logic
 * - Everything else → unknown (rules are never applied to unknown files)
 *
 * @param filePath - Absolute or relative file path
 * @returns FileType classification
 */
export const detectFileType = (filePath: string): FileType => {
    const basename = path.basename(filePath);
    const ext = path.extname(filePath);

    // Check Angular-specific patterns (order matters)
    if (basename.endsWith('.component.ts')) return 'component';
    if (basename.endsWith('.directive.ts')) return 'directive';
    if (basename.endsWith('.pipe.ts')) return 'pipe';
    if (basename.endsWith('.service.ts')) return 'service';
    if (basename.endsWith('.module.ts')) return 'module';
    if (basename.endsWith('.guard.ts')) return 'guard';

    // Check by extension
    if (ext === '.html') return 'template';
    if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less') return 'style';
    if (basename.endsWith('.config.ts') || ext === '.json') return 'config';

    // Spec/test files get their own type so spec-scoped rules are routed correctly.
    if (basename.endsWith('.spec.ts') || basename.endsWith('.test.ts')) return 'spec';

    // Non-Angular TypeScript files (utilities, helpers, etc.) are still valid
    // analysis targets for rules with dependencyType 'standalone' or 'imports'.
    if (ext === '.ts') return 'logic';

    // Files that don't match any known pattern — rules are never applied to these.
    return 'unknown';
};

/**
 * Checks if a file is a TypeScript file.
 *
 * @param filePath - File path
 * @returns true if TypeScript file
 */
export const isTypeScriptFile = (filePath: string): boolean => {
    return path.extname(filePath) === '.ts';
};

/**
 * Checks if a file is a template file (HTML).
 *
 * @param filePath - File path
 * @returns true if template file
 */
export const isTemplateFile = (filePath: string): boolean => {
    return path.extname(filePath) === '.html';
};

/**
 * Checks if a file is a style file (CSS/SCSS/etc).
 *
 * @param filePath - File path
 * @returns true if style file
 */
export const isStyleFile = (filePath: string): boolean => {
    const ext = path.extname(filePath);
    return ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less';
};

/**
 * Checks if a file is a spec file (test).
 *
 * @param filePath - File path
 * @returns true if spec file
 */
export const isSpecFile = (filePath: string): boolean => {
    return path.basename(filePath).endsWith('.spec.ts');
};

/**
 * Checks if a file is a component file.
 *
 * @param filePath - File path
 * @returns true if component file
 */
export const isComponentFile = (filePath: string): boolean => {
    return path.basename(filePath).endsWith('.component.ts');
};

/**
 * Gets the base name without Angular suffix.
 * Example: "user.component.ts" → "user"
 *
 * @param filePath - File path
 * @returns Base name without suffix
 */
export const getBaseName = (filePath: string): string => {
    const basename = path.basename(filePath);

    // Remove Angular suffixes
    const suffixes = [
        '.component.ts',
        '.directive.ts',
        '.pipe.ts',
        '.service.ts',
        '.module.ts',
        '.guard.ts',
        '.spec.ts',
    ];

    for (const suffix of suffixes) {
        if (basename.endsWith(suffix)) {
            return basename.slice(0, -suffix.length);
        }
    }

    // Remove extension
    return path.basename(filePath, path.extname(filePath));
};

