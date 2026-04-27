/**
 * Extends Chain Validation
 *
 * Validates that every entry in the `extends` field can be resolved to an
 * installed npm package or a valid local path. This prevents the silent 
 * failure where a user references a missing preset, causing the engine 
 * to run with an empty rule set.
 *
 * @module
 */

import { createRequire } from "node:module";
import nodePath from "node:path";
import process from "node:process";
import type { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import type { ConfigBlockValidation, ValidatedConfig } from "../types.js";

/**
 * Internal logic for determining if a preset specifier should be skipped.
 * * Skips:
 * - Relative/Local paths (e.g., "./my-config")
 * - Absolute paths
 * - Plugin-style specifiers (handled by the rule engine's internal resolver)
 */
function isSkippable(preset: string): boolean {
    const isLocal = preset.startsWith(".");
    const isAbsolute = nodePath.isAbsolute(preset);
    const isPluginSpecifier = preset.includes(":");

    return isLocal || isAbsolute || isPluginSpecifier;
}

/**
 * Attempts to resolve a module specifier using the Node.js resolution algorithm.
 * Uses a fictional anchor file to ensure resolution occurs relative to the 
 * project's working directory rather than the tool's installation path.
 */
function tryResolve(preset: string, cwd: string): string | null {
    try {
        const anchorFile = nodePath.join(cwd, "__resolve_anchor__.cjs");
        const requireFn = createRequire(anchorFile);

        return requireFn.resolve(preset);
    } catch {
        return null;
    }
}

/**
 * Validates that all npm-package entries in the 'extends' configuration field 
 * are resolvable within the current project environment.
 *
 * @param config - The configuration object to inspect.
 * @param basePath - The structural path used for issue attribution.
 * @param cwd - The project root directory used as the base for resolution.
 * @returns A validation result containing issues for any unresolvable presets.
 */
export function validateExtendsChain(
    config: ValidatedConfig,
    basePath: (string | number)[] = [],
    cwd: string = process.cwd(),
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    /**
     * Guard: Missing Extends
     * If no 'extends' field is present, we consider the chain valid.
     */
    if (!config.extends) {
        return { issues };
    }

    /**
     * Normalization: Input Format
     * The schema permits either a single string or an array of strings.
     * We normalize to an array to maintain a consistent processing loop.
     */
    const extendsList: unknown[] = Array.isArray(config.extends) ? config.extends : [config.extends];
    const isArray = Array.isArray(config.extends);

    /**
     * Processing Loop: Resolution Verification
     * Iterates through each preset to verify its existence on the filesystem.
     */
    for (let i = 0; i < extendsList.length; i++) {
        const preset = extendsList[i];

        /**
         * Validation: Type and Content
         * Ignore entries that are not strings or are purely whitespace.
         */
        if (typeof preset !== "string" || preset.trim() === "") {
            continue;
        }

        /**
         * Short-circuit: Skippable Specifiers
         * Local files and specialized plugin syntax are bypassed.
         */
        if (isSkippable(preset)) {
            continue;
        }

        /**
         * Resolution: Node Module Lookup
         * Attempt to find the package relative to the provided CWD.
         */
        const resolved = tryResolve(preset, cwd);

        if (resolved === null) {
            /**
             * Reporting: Path Construction
             * Constructs a precise path. If the input was an array, the index 
             * is appended to help the user find the specific failing entry.
             */
            const issuePath: (string | number)[] = [...basePath, "extends"];

            if (isArray) {
                issuePath.push(i);
            }

            issues.push({
                ...MESSAGES.EXTENDS_NOT_FOUND(preset),
                path: issuePath,
            });
        }
    }

    return { issues };
}