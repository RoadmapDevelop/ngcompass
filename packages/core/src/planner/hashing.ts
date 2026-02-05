/**
 * Content Hashing
 *
 * Pure functions for calculating content hashes for cache invalidation.
 * Hash includes: file content + related resources + active rules
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { TaskInputs } from './types.js';
import type { ResolvedRule } from '../rules/types.js';

/**
 * Computes SHA-256 hash of a string.
 *
 * @param content - Content to hash
 * @returns Hex-encoded hash
 */
export const computeHash = (content: string): string => {
    return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * Reads file content safely.
 *
 * @param filePath - File path
 * @returns File content or empty string if error
 */
const readFileSafe = (filePath: string): string => {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
};

/**
 * Calculates hash for a single file.
 *
 * @param filePath - File path
 * @returns Content hash
 */
export const hashFile = (filePath: string): string => {
    const content = readFileSafe(filePath);
    return computeHash(content);
};

/**
 * Calculates hash for multiple files combined.
 *
 * @param filePaths - Array of file paths
 * @returns Combined hash
 */
export const hashFiles = (filePaths: ReadonlyArray<string>): string => {
    const combinedContent = filePaths
        .map((path) => readFileSafe(path))
        .join('\n---FILE-BOUNDARY---\n');
    return computeHash(combinedContent);
};

/**
 * Calculates hash for rules configuration.
 * Includes rule names, severities, and options.
 *
 * @param rules - Rules that apply to this file
 * @returns Rules hash
 */
export const hashRules = (rules: ReadonlyArray<ResolvedRule>): string => {
    const rulesData = rules
        .map((rule) => ({
            name: rule.name,
            severity: rule.severity,
            options: rule.options,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort for determinism

    const rulesJson = JSON.stringify(rulesData);
    return computeHash(rulesJson);
};

/**
 * Calculates combined hash for a file and its resources.
 * Hash = hash(tsContent + templateContent + stylesContent + rulesConfig)
 *
 * @param inputs - Task inputs (all resources)
 * @param applicableRules - Rules that apply to this file
 * @returns Combined content hash
 */
export const calculateFileHash = (
    inputs: TaskInputs,
    applicableRules: ReadonlyArray<ResolvedRule>
): string => {
    const filePaths: string[] = [];

    // Collect all file paths
    filePaths.push(inputs.typescript.path);

    if (inputs.template) {
        filePaths.push(inputs.template.path);
    }

    if (inputs.styles) {
        filePaths.push(...inputs.styles.map((s) => s.path));
    }

    if (inputs.spec) {
        filePaths.push(inputs.spec.path);
    }

    // Hash all files
    const filesHash = hashFiles(filePaths);

    // Hash rules configuration
    const rulesHash = hashRules(applicableRules);

    // Combine file hash + rules hash
    return computeHash(`${filesHash}::${rulesHash}`);
};

/**
 * Calculates hash for task inputs only (no rules).
 * Used for detecting if resources changed.
 *
 * @param inputs - Task inputs
 * @returns Inputs hash
 */
export const hashTaskInputs = (inputs: TaskInputs): string => {
    const filePaths: string[] = [];

    filePaths.push(inputs.typescript.path);

    if (inputs.template) {
        filePaths.push(inputs.template.path);
    }

    if (inputs.styles) {
        filePaths.push(...inputs.styles.map((s) => s.path));
    }

    if (inputs.spec) {
        filePaths.push(inputs.spec.path);
    }

    return hashFiles(filePaths);
};

/**
 * Fast hash using only file stats (size + mtime).
 * Much faster than content hash but less accurate.
 *
 * @param filePath - File path
 * @returns Stats-based hash
 */
export const hashFileStats = (filePath: string): string => {
    try {
        const stats = readFileSync(filePath).length; // Just get size for now
        return computeHash(`${filePath}::${stats}`);
    } catch {
        return '';
    }
};

/**
 * Calculates hash for a single file input.
 * Returns empty string if file doesn't exist.
 *
 * @param filePath - File path
 * @returns Content hash or empty string
 */
export const hashFileInput = (filePath: string): string => {
    return hashFile(filePath);
};

/**
 * Calculates content-based task ID for task-centric caching.
 *
 * Task ID includes:
 * - Rule name
 * - All input file content hashes
 * - Rule options
 *
 * This enables:
 * - Cache hits even after file renames (content unchanged)
 * - Precise invalidation (only when relevant content changes)
 * - Cross-project cache sharing (same content = same ID)
 *
 * @param ruleName - Rule name
 * @param inputs - Task inputs with hashes
 * @param options - Rule options
 * @returns Content-based task ID (SHA-256)
 */
export const calculateTaskId = (
    ruleName: string,
    inputs: TaskInputs,
    options: Readonly<Record<string, unknown>>
): string => {
    const parts: string[] = [ruleName];

    // Add TypeScript hash (always present)
    parts.push(inputs.typescript.hash);

    // Add template hash (if present)
    if (inputs.template) {
        parts.push(inputs.template.hash);
    }

    // Add styles hashes (if present)
    if (inputs.styles && inputs.styles.length > 0) {
        const stylesHash = inputs.styles.map((s) => s.hash).join('::');
        parts.push(stylesHash);
    }

    // Add spec hash (if present)
    if (inputs.spec) {
        parts.push(inputs.spec.hash);
    }

    // Add options (stringified for determinism)
    parts.push(JSON.stringify(options));

    // Combine all parts and hash
    return computeHash(parts.join('::'));
};
