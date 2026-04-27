import { defu } from "defu";

import { ConfigIssue, ConfigValidationResult, NormalizedAnalyzerConfig } from "@ngcompass/common";
import { AnalyzerConfigSchema } from "../schemas/schema.js";
import { createDefaultContext } from "./context.js";
import { ValidatedConfig, ValidationContext } from "./types.js";
import {
    validateCrossFields,
    validateExtendsChain,
    validateGlobPatterns,
    validatePaths,
    validateRules,
    validateDeprecatedFields,
} from "./checks/index.js";
import { enrichIssueLocations } from "./enricher.js";
import { AstCache } from "@ngcompass/cache";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ERROR_CODES = {
    /** Emitted when an individual semantic check throws an unexpected error. */
    CHECK_FAILED: "check-failed",
    PROFILE_NOT_FOUND: "error-profile-not-found",
} as const;

const BUILTIN_PRESETS = new Set([
    "recommended",
    "strict",
    "performance",
    "reactivity",
    "all",
]);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

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

/**
 * Describes a single semantic check so that per-check errors can be isolated
 * and reported with the check name for easier debugging.
 */
interface CheckDescriptor {
    name: string;
    run: () => ConfigIssue[];
}

// ---------------------------------------------------------------------------
// Schema parsing
// ---------------------------------------------------------------------------

/**
 * Runs Zod schema validation on `config`.
 *
 * On failure the raw config is cast to `ValidatedConfig` so that semantic
 * checks can still run on a best-effort basis — catching issues in checks
 * that don't require a fully-valid schema.
 */
function parseSchema(
    config: unknown,
    basePath: (string | number)[],
    filePath: string | undefined,
): { issues: ConfigIssue[]; validated: ValidatedConfig; success: boolean } {
    const result = AnalyzerConfigSchema.safeParse(config);

    if (!result.success) {
        const issues: ConfigIssue[] = result.error.issues.map(issue => ({
            code: issue.code.replace(/_/g, "-"),
            message: issue.message,
            path: [...basePath, ...issue.path] as (string | number)[],
            severity: "error" as const,
            file: filePath,
        }));

        // Cast to ValidatedConfig so semantic checks can still run
        return { issues, validated: config as ValidatedConfig, success: false };
    }

    return { issues: [], validated: result.data, success: true };
}

// ---------------------------------------------------------------------------
// Semantic checks (Gap 1 + Gap 2)
// ---------------------------------------------------------------------------

/**
 * Runs all semantic checks against a (possibly best-effort) validated config.
 *
 * Gap 2 fix: each check runs in its own try-catch so that a crash in one
 * check never suppresses the results of all others.
 *
 * Gap 1 fix: `validateExtendsChain` is included in the check list and
 * receives the project `cwd` so it can resolve npm packages correctly.
 *
 * @param validated - Validated (or best-effort cast) config object.
 * @param config    - Raw, unvalidated config (used by deprecated-fields check).
 * @param context   - Validation context (fs/os/path abstractions + cwd).
 * @param basePath  - Ancestor path for issue attribution.
 * @param filePath  - Source file, used for issue attribution on check errors.
 */
function runSemanticChecks(
    validated: ValidatedConfig,
    config: unknown,
    context: ValidationContext,
    basePath: (string | number)[],
    filePath: string | undefined,
): ConfigIssue[] {
    const checks: CheckDescriptor[] = [
        {
            name: "cross-fields",
            run: () => validateCrossFields(validated, context, basePath).issues,
        },
        {
            name: "glob-patterns",
            run: () => validateGlobPatterns(validated, basePath).issues,
        },
        {
            name: "paths",
            run: () => validatePaths(validated, context, basePath).issues,
        },
        {
            name: "rules",
            run: () => validateRules(validated, basePath).issues,
        },
        {
            name: "extends-chain",
            run: () => validateExtendsChain(validated, basePath, context.cwd).issues,
        },
        {
            name: "deprecated",
            run: () => validateDeprecatedFields(config, basePath).issues,
        },
    ];

    const allIssues: ConfigIssue[] = [];

    for (const check of checks) {
        try {
            allIssues.push(...check.run());
        } catch (err) {
            // One check crashing must not silence the remaining checks.
            allIssues.push({
                code: ERROR_CODES.CHECK_FAILED,
                message: `Check "${check.name}" encountered an unexpected error: ${(err as Error).message}`,
                path: basePath,
                severity: "error" as const,
                file: filePath,
            });
        }
    }

    return allIssues;
}

// ---------------------------------------------------------------------------
// Location enrichment
// ---------------------------------------------------------------------------

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

    type WritableIssue = { -readonly [K in keyof ConfigIssue]: ConfigIssue[K] };
    for (const issue of issues as WritableIssue[]) {
        if (!issue.file) issue.file = filePath;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    const profileLooksLikePreset = BUILTIN_PRESETS.has(profile.replace(/^ngcompass:/, ""));
    const presetHint = profileLooksLikePreset
        ? ` "${profile}" is a built-in preset, not a config profile. Use 'extends: "ngcompass:${profile.replace(/^ngcompass:/, "")}"' in your config instead.`
        : "";
    return {
        config: undefined,
        report: {
            valid: false,
            issues: [{
                code: ERROR_CODES.PROFILE_NOT_FOUND,
                message: `Profile "${profile}" not found. Available: [${available}]${presetHint}`,
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
