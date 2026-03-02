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
    validateDeprecatedFields,
} from "./checks/index.js";
import { enrichIssueLocations } from "./enricher.js";
import { AstCache } from "@ngcompass/cache";

const ERROR_CODES = {
    SEMANTIC_VALIDATION_FAILED: "error-semantic",
    PROFILE_NOT_FOUND: "error-profile-not-found",
} as const;


interface BlockValidationOptions {
    config: unknown;
    context: ValidationContext;
    basePath?: (string | number)[];
    filePath?: string;
    fileContent?: string;
    astCache?: AstCache;
    contentHash?: string;
}

interface BlockValidationResult {
    issues: ConfigIssue[];
    validated?: ValidatedConfig;
}

function parseSchema(
    config: unknown,
    basePath: (string | number)[],
    filePath: string | undefined,
): { issues: ConfigIssue[]; validated: ValidatedConfig | undefined; success: boolean } {
    const result = AnalyzerConfigSchema.safeParse(config);

    if (!result.success) {
        const issues: ConfigIssue[] = result.error.issues.map(issue => ({
            code: issue.code.replace(/_/g, "-"),
            message: issue.message,
            path: [...basePath, ...issue.path] as (string | number)[],
            severity: "error" as const,
            file: filePath,
        }));

        return { issues, validated: config as ValidatedConfig, success: false };
    }

    return { issues: [], validated: result.data, success: true };
}

function runSemanticChecks(
    validated: ValidatedConfig | undefined,
    config: unknown,
    context: ValidationContext,
    basePath: (string | number)[],
    filePath: string | undefined,
): ConfigIssue[] {
    if (!validated) return [];

    try {
        return [
            validateCrossFields(validated, context, basePath),
            validateGlobPatterns(validated, basePath),
            validatePaths(validated, context, basePath),
            validateRules(validated, basePath),
            validateDeprecatedFields(config, basePath),
        ].flatMap(check => check.issues);
    } catch (err) {
        return [{
            code: ERROR_CODES.SEMANTIC_VALIDATION_FAILED,
            message: `Semantic validation failed: ${(err as Error).message}`,
            path: basePath,
            severity: "error" as const,
            file: filePath,
        }];
    }
}

async function attachFileLocations(
    issues: ConfigIssue[],
    filePath: string,
    fileContent: string | undefined,
    astCache: AstCache | undefined,
    contentHash: string | undefined,
): Promise<void> {
    if (fileContent) {
        await enrichIssueLocations(issues, fileContent, filePath, astCache, contentHash);
        return;
    }

    for (const issue of issues) {
        if (!issue.file) issue.file = filePath;
    }
}

function deduplicateIssues(issues: ConfigIssue[]): ConfigIssue[] {
    const seen = new Set<string>();
    return issues.filter(issue => {
        const key = `${issue.code}:${issue.message}:${JSON.stringify(issue.path)}`;
        return seen.has(key) ? false : (seen.add(key), true);
    });
}

function sortIssuesBySeverity(issues: ConfigIssue[]): ConfigIssue[] {
    return [...issues].sort((a, b) => {
        if (a.severity === b.severity) return 0;
        return a.severity === "error" ? -1 : 1;
    });
}

function hasErrors(issues: ConfigIssue[]): boolean {
    return issues.some(issue => issue.severity === "error");
}

function buildValidationResult(
    issues: ConfigIssue[],
    finalConfig: ValidatedConfig | undefined,
): ConfigValidationResult {
    const unique = sortIssuesBySeverity(deduplicateIssues(issues));
    const valid = !hasErrors(unique);
    return {
        config: valid ? (finalConfig as unknown as NormalizedAnalyzerConfig) : undefined,
        report: { valid, issues: unique },
    };
}

function resolveProfiles(rawConfig: unknown): Record<string, unknown> {
    if (rawConfig === null || typeof rawConfig !== "object") return {};
    return ((rawConfig as Record<string, unknown>)["profiles"] as Record<string, unknown>) ?? {};
}

function buildProfileNotFoundResult(
    profile: string,
    availableProfiles: Record<string, unknown>,
    filePath: string | undefined,
): ConfigValidationResult {
    const available = Object.keys(availableProfiles).join(", ");
    return {
        config: undefined,
        report: {
            valid: false,
            issues: [{
                code: ERROR_CODES.PROFILE_NOT_FOUND,
                message: `Profile "${profile}" not found. Available: [${available}]`,
                path: ["profiles", profile],
                severity: "error" as const,
                file: filePath,
            }],
        },
    };
}

// ── Core Block Validator ───────────────────────────────────────────────────────

async function validateBlock(options: BlockValidationOptions): Promise<BlockValidationResult> {
    const {
        config, context, basePath = [], filePath, fileContent, astCache, contentHash,
    } = options;

    const { issues: schemaIssues, validated, success } = parseSchema(config, basePath, filePath);
    const semanticIssues = runSemanticChecks(validated, config, context, basePath, filePath);
    const allIssues = [...schemaIssues, ...semanticIssues];

    if (filePath) {
        await attachFileLocations(allIssues, filePath, fileContent, astCache, contentHash);
    }

    return { issues: allIssues, validated: success ? validated : undefined };
}

/**
 * Validates a raw configuration object against the full schema and semantic rule set.
 *
 * When a `context.profile` is specified the matching profile is deep-merged over
 * the base config before validation, so profile-level overrides are respected.
 *
 * @param rawConfig    - The raw, unparsed configuration (from file or programmatic source).
 * @param context      - Runtime validation context supplying fs/os/path abstractions.
 * @param filePath     - Source file path; used for issue attribution and location enrichment.
 * @param fileContent  - Raw file text; required for accurate line/column enrichment.
 * @param astCache     - Optional AST cache to avoid redundant parses during enrichment.
 * @param contentHash  - Optional content hash to key the AST cache lookup.
 * @returns A `ConfigValidationResult` with the resolved config (if valid) and the issue report.
 */
export async function validateConfiguration(
    rawConfig: unknown,
    context: ValidationContext = createDefaultContext(),
    filePath?: string,
    fileContent?: string,
    astCache?: AstCache,
    contentHash?: string,
): Promise<ConfigValidationResult> {
    const baseOptions = { context, filePath, fileContent, astCache, contentHash };
    const availableProfiles = resolveProfiles(rawConfig);

    if (context.profile) {
        const profileConfig = availableProfiles[context.profile];

        if (!profileConfig) {
            return buildProfileNotFoundResult(context.profile, availableProfiles, filePath);
        }

        const merged = defu(profileConfig as Record<string, unknown>, rawConfig as Record<string, unknown>);
        const { issues, validated } = await validateBlock({
            ...baseOptions,
            config: merged,
            basePath: ["profiles", context.profile],
        });

        return buildValidationResult(issues, validated);
    }

    const { issues, validated } = await validateBlock({ ...baseOptions, config: rawConfig });
    return buildValidationResult(issues, validated);
}
