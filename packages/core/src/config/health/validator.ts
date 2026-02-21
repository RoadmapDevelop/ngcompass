import { defu } from "defu";

import { ConfigIssue, ConfigValidationResult, NormalizedAnalyzerConfig } from "@ngcompass/common";
import { AnalyzerConfigSchema } from "../schemas/schema.js";
import { createDefaultContext } from "./context.js";
import { ValidatedConfig, ValidationContext } from "./types.js";
import {
    validateCrossFields,
    validateGlobPatterns,
    validatePaths,
    validateRules,
    validateDeprecatedFields
} from "./checks/index.js";
import { AstCache } from "../../cache/services/ast-cache.js";
import { enrichIssueLocations } from "./enricher.js";

/**
 * Internal helper to validate a single loaded/merged configuration block.
 */
async function validateSingleBlock(
    config: any,
    context: ValidationContext,
    basePath: (string | number)[] = [],
    filePath?: string,
    fileContent?: string,
    astCache?: AstCache,
    contentHash?: string
): Promise<{ issues: ConfigIssue[]; validated?: ValidatedConfig }> {
    const allIssues: ConfigIssue[] = [];
    let validated: ValidatedConfig | undefined;

    // 1. Schema Validation (Zod)
    const result = AnalyzerConfigSchema.safeParse(config);

    if (!result.success) {
        const schemaIssues: ConfigIssue[] = result.error.issues.map(issue => ({
            code: issue.code.replace(/_/g, '-'),
            message: issue.message,
            path: [...basePath, ...issue.path] as (string | number)[],
            severity: 'error',
            file: filePath
        }));

        allIssues.push(...schemaIssues);

        // Best effort: continue with partial validation if possible
        validated = config as ValidatedConfig;
    } else {
        validated = result.data;
    }

    // 2. Structural & Semantic Checks (always run)
    try {
        const checks = [
            validateCrossFields(validated, context, basePath),
            validateGlobPatterns(validated, basePath),
            validatePaths(validated, context, basePath),
            validateRules(validated, basePath),
            validateDeprecatedFields(config, basePath)
        ];

        for (const check of checks) {
            allIssues.push(...check.issues);
        }
    } catch (err) {
        allIssues.push({
            code: "error-semantic",
            message: `Semantic validation failed: ${(err as Error).message}`,
            path: basePath,
            severity: "error",
            file: filePath
        });
    }

    // Post-process to ensure file association and accurate location
    // Post-process to ensure file association and accurate location
    if (filePath) {
        if (fileContent) {
            await enrichIssueLocations(allIssues, fileContent, filePath, astCache, contentHash);
        } else {
            // Fallback if no content
            for (const issue of allIssues) {
                if (!issue.file) issue.file = filePath;
            }
        }
    }

    return {
        issues: allIssues,
        validated: result.success ? validated : undefined
    };
}

export async function validateConfiguration(
    rawConfig: any,
    context: ValidationContext = createDefaultContext(),
    filePath?: string,
    fileContent?: string,
    astCache?: AstCache,
    contentHash?: string
): Promise<ConfigValidationResult> {
    const allIssues: ConfigIssue[] = [];
    let finalConfig: ValidatedConfig | undefined;

    const availableProfiles = (rawConfig as any)?.profiles ?? {};

    if (context.profile) {
        const profileConfig = availableProfiles[context.profile];
        if (!profileConfig) {
            const available = Object.keys(availableProfiles).join(", ");
            return {
                config: undefined,
                report: {
                    valid: false,
                    issues: [{
                        code: "error-profile-not-found",
                        message: `Profile "${context.profile}" not found. Available: [${available}]`,
                        path: ["profiles", context.profile],
                        severity: "error",
                        file: filePath
                    }]
                }
            };
        }

        const merged = defu(profileConfig, rawConfig);
        const result = await validateSingleBlock(merged, context, ["profiles", context.profile], filePath, fileContent, astCache, contentHash);
        allIssues.push(...result.issues);
        finalConfig = result.validated;
    } else {
        const baseResult = await validateSingleBlock(rawConfig, context, [], filePath, fileContent, astCache, contentHash);
        allIssues.push(...baseResult.issues);
        finalConfig = baseResult.validated;
    }

    // Deduplicate issues by code, message, and path
    const seen = new Set<string>();
    const uniqueIssues = allIssues.filter(issue => {
        const key = `${issue.code}:${issue.message}:${JSON.stringify(issue.path)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort issues: Errors first, then Warnings
    uniqueIssues.sort((a, b) => {
        if (a.severity === b.severity) return 0;
        return a.severity === "error" ? -1 : 1;
    });

    const isValid = !uniqueIssues.some(i => i.severity === "error");

    return {
        config: isValid ? (finalConfig as unknown as NormalizedAnalyzerConfig) : undefined,
        report: {
            valid: isValid,
            issues: uniqueIssues
        }
    };
}
