import { describe, it, expect } from "vitest";
import { createDefaultContext } from "../../src/config/health/context.js";
import { validateConfiguration } from "../../src/config/health/index.js";
import { ValidationContext } from "../../src/config/health/types.js";

// ==============================================================================
// MOCK CONTEXT FACTORY
// ==============================================================================
function createMockContext(overrides?: Partial<ValidationContext>): ValidationContext {
    const defaultContext = createDefaultContext();

    return {
        fs: {
            existsSync: (p: string) => overrides?.fs?.existsSync?.(p) ?? true,
            accessSync: (p: string, mode: number) => {
                overrides?.fs?.accessSync?.(p, mode);
            },
        },
        os: {
            cpus: () => overrides?.os?.cpus?.() ?? Array(4).fill({ model: "Intel Core i7" }),
        },
        path: {
            dirname: (p: string) => overrides?.path?.dirname?.(p) ?? defaultContext.path.dirname(p),
        },
    };
}

// ==============================================================================
// PROPERTY: GLOB PATTERN VALIDATION
// ==============================================================================
describe("Property: Glob Pattern Validation", () => {
    const mockContext = createMockContext();

    describe("should detect invalid glob syntax", () => {
        const invalidGlobPatterns = [
            { pattern: "**/*.invalid[", reason: "unclosed bracket" },
            { pattern: "///invalid///path", reason: "invalid path pattern" },
            { pattern: "", reason: "empty pattern" },
            { pattern: "src/[unclosed.ts", reason: "unclosed bracket" },
            { pattern: "[invalid-pattern", reason: "unclosed bracket" },
            { pattern: "**/*.{ts,js", reason: "unmatched braces" },
            { pattern: "///bad///path///", reason: "invalid path pattern" },
            { pattern: "some/path/", reason: "trailing slash" },
            { pattern: "**/{unclosed.js", reason: "unmatched braces" },
            { pattern: "invalid[pattern", reason: "unclosed bracket" },
        ];

        invalidGlobPatterns.forEach(({ pattern, reason }) => {
            it(`should reject "${pattern}" - ${reason}`, async () => {
                const config = {
                    include: [pattern],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {},
                };

                const report = await validateConfiguration(config, mockContext);

                const hasError = report.report.issues.some(i =>
                    i.severity === "error" && (i.message.includes(reason) || i.message.includes(pattern))
                );

                if (!hasError) {
                    console.log(`Failed expectation: "${reason}" or "${pattern}"`);
                    console.log("Actual issues:", JSON.stringify(report.report.issues, null, 2));
                }

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.code === "error-invalid-glob-pattern" && i.message.includes(reason)
                )).toBe(true);
            });
        });
    });

    describe("should detect empty patterns", () => {
        const fields = ["include", "exclude", "ignorePatterns"] as const;

        fields.forEach(field => {
            it(`should reject empty pattern in ${field}`, async () => {
                const config = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {},
                    [field]: [""],
                };

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.severity === "error" && i.message.includes("empty glob pattern") && i.message.includes(field) && i.code === "error-empty-glob-pattern"
                )).toBe(true);
            });
        });
    });

    it("should detect duplicate patterns and warn", async () => {
        const config = {
            include: ["src/**/*.ts"],
            exclude: ["node_modules"],
            failOnSeverity: "high" as const,
            ignorePatterns: ["**/*.min.js", "**/*.generated.ts", "**/*.min.js"],
            rules: {},
        };

        const report = await validateConfiguration(config, mockContext);

        expect(report.report.issues.some(i =>
            i.severity === "warning" && i.message.includes("duplicate") && i.message.includes("**/*.min.js") && i.code === "warn-duplicate-patterns"
        )).toBe(true);
    });

    it("should accept valid glob patterns", async () => {
        const validPatterns = [
            "src/**/*.ts",
            "lib/**/*.tsx",
            "**/*.{ts,tsx}",
            "**/node_modules/**",
            "dist/**",
        ];

        const config = {
            include: validPatterns,
            exclude: ["node_modules"],
            failOnSeverity: "high" as const,
            rules: {},
        };

        const report = await validateConfiguration(config, mockContext);

        expect(report.report.valid).toBe(true);
    });
});

// ==============================================================================
// PROPERTY: TYPE VALIDATION (ZOD SCHEMA)
// ==============================================================================
describe("Property: Type Validation", () => {
    const mockContext = createMockContext();

    describe("should validate boolean fields", () => {
        const booleanFields = [
            { field: "watch", invalidValue: "yes" },
            { field: "watch", invalidValue: 123 },
            { field: "autoFix", invalidValue: null },
            { field: "autoFix", invalidValue: "true" },
            { field: "autoFixOnSave", invalidValue: 1 },
            { field: "reportUnusedDisableDirectives", invalidValue: 123 },
        ];

        booleanFields.forEach(({ field, invalidValue }) => {
            it(`should reject ${field}: ${JSON.stringify(invalidValue)} (expected boolean)`, async () => {
                const config = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    [field]: invalidValue,
                    rules: {},
                };

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.severity === "error" && i.message.includes(field) && (i.message.includes("boolean") || i.message.includes("expected boolean"))
                )).toBe(true);
            });
        });
    });

    describe("should validate number fields", () => {
        const numberFields = [
            { field: "maxWarnings", invalidValue: "lots" },
            { field: "maxWorkers", invalidValue: "4" },
            { field: "parserOptions.ecmaVersion", invalidValue: "2021" },
            { field: "watchOptions.debounce", invalidValue: "500ms" },
        ];

        numberFields.forEach(({ field, invalidValue }) => {
            it(`should reject ${field}: ${JSON.stringify(invalidValue)} (expected number)`, async () => {
                const config: any = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {},
                };

                // Build nested object structure
                const parts = field.split('.');
                let current = config;
                for (let i = 0; i < parts.length - 1; i++) {
                    current[parts[i]] = current[parts[i]] || {};
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = invalidValue;

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.severity === "error" && (i.message.includes("number") || i.message.includes("expected number"))
                )).toBe(true);
            });
        });
    });

    describe("should validate enum fields", () => {
        const enumFields = [
            { field: "failOnSeverity", invalidValue: "ultra-critical", validValues: ["low", "moderate", "high", "critical"] },
            { field: "outputFormat", invalidValue: "xml", validValues: ["json", "text", "sarif", "html"] },
            { field: "cache.strategy", invalidValue: "redis", validValues: ["local", "memory"] },
            { field: "parserOptions.sourceType", invalidValue: "invalid", validValues: ["module", "commonjs"] },
        ];

        enumFields.forEach(({ field, invalidValue, validValues }) => {
            it(`should reject ${field}: "${invalidValue}" (expected one of: ${validValues.join(', ')})`, async () => {
                const config: any = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {},
                };

                // Build nested object structure
                const parts = field.split('.');
                let current = config;
                for (let i = 0; i < parts.length - 1; i++) {
                    current[parts[i]] = current[parts[i]] || {};
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = invalidValue;

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.severity === "error" && (i.message.includes(invalidValue) || validValues.some(v => i.message.includes(v)))
                )).toBe(true);
            });
        });
    });
});

// ==============================================================================
// PROPERTY: RANGE VALIDATION
// ==============================================================================
describe("Property: Range Validation", () => {
    const mockContext = createMockContext();

    describe("should validate positive number constraints", () => {
        const constraints = [
            { field: "maxWorkers", invalidValue: 0, minValue: 1 },
            { field: "maxWorkers", invalidValue: -4, minValue: 1 },
            { field: "cache.ttl", invalidValue: -5000, minValue: 0 },
            { field: "cache.ttl", invalidValue: -1000, minValue: 0 },
        ];

        constraints.forEach(({ field, invalidValue, minValue }) => {
            it(`should reject ${field}: ${invalidValue} (must be >= ${minValue})`, async () => {
                const config: any = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {},
                };

                // Build nested object structure
                const parts = field.split('.');
                let current = config;
                for (let i = 0; i < parts.length - 1; i++) {
                    current[parts[i]] = current[parts[i]] || { enabled: true, location: ".cache", strategy: "local" };
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = invalidValue;

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.severity === "error" && (i.message.includes(`>= ${minValue}`) || i.message.includes("must be"))
                )).toBe(true);
            });
        });
    });
});

// ==============================================================================
// PROPERTY: PATH VALIDATION
// ==============================================================================
describe("Property: Path Validation", () => {
    describe("should validate file/directory existence", () => {
        const pathTests = [
            {
                field: "parserOptions.tsconfigRootDir",
                path: "../../../../../../../etc",
                errorMessage: "does not exist"
            },
            {
                field: "outputPath",
                path: "/root/cannot/write/here.json",
                errorMessage: "does not exist"
            },
        ];

        pathTests.forEach(({ field, path, errorMessage }) => {
            it(`should reject non-existent path: ${field} = "${path}"`, async () => {
                const mockContext = createMockContext({
                    fs: {
                        existsSync: () => false,
                        accessSync: () => { },
                    },
                });

                const config: any = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {},
                };

                // Build nested structure
                const parts = field.split('.');
                let current = config;
                for (let i = 0; i < parts.length - 1; i++) {
                    current[parts[i]] = current[parts[i]] || {};
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = path;

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.severity === "error" && i.message.includes(errorMessage)
                )).toBe(true);
            });
        });
    });

    it("should accept existing paths", async () => {
        const mockContext = createMockContext({
            fs: {
                existsSync: () => true,
                accessSync: () => { },
            },
        });

        const config = {
            include: ["src/**/*.ts"],
            exclude: ["node_modules"],
            failOnSeverity: "high" as const,
            outputPath: "./reports/output.json",
            parserOptions: {
                tsconfigRootDir: ".",
            },
            rules: {},
        };

        const report = await validateConfiguration(config, mockContext);

        expect(report.report.valid).toBe(true);
    });
});

// ==============================================================================
// PROPERTY: RULE VALIDATION
// ==============================================================================
describe("Property: Rule Validation", () => {
    const mockContext = createMockContext();

    describe("should validate rule severity values", () => {
        const invalidSeverities = [
            { ruleName: "no-debugger", severity: "ultra-high" },
            { ruleName: "no-var", severity: "HIGH" },
            { ruleName: "eqeqeq", severity: { severity: "super-critical", options: {} } },
            { ruleName: "no-implicit-any", severity: { severity: "MODERATE", options: {} } },
            { ruleName: "unused-variables", severity: { severity: "invalid-level", options: {} } },
        ];

        invalidSeverities.forEach(({ ruleName, severity }) => {
            it(`should reject invalid severity for rule "${ruleName}"`, async () => {
                const config = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {
                        [ruleName]: severity,
                    },
                };

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
                expect(report.report.issues.some(i =>
                    i.severity === "error" && (i.message.includes(ruleName) || i.message.includes("severity"))
                )).toBe(true);
            });
        });
    });

    describe("should validate rule value types", () => {
        const invalidTypes = [
            { ruleName: "rule-with-null", value: null },
            { ruleName: "rule-with-number", value: 123 },
        ];

        invalidTypes.forEach(({ ruleName, value }) => {
            it(`should reject ${ruleName}: ${JSON.stringify(value)}`, async () => {
                const config = {
                    include: ["src/**/*.ts"],
                    exclude: ["node_modules"],
                    failOnSeverity: "high" as const,
                    rules: {
                        [ruleName]: value,
                    },
                };

                const report = await validateConfiguration(config, mockContext);

                expect(report.report.valid).toBe(false);
            });
        });
    });

    it("should detect empty rule names", async () => {
        const config = {
            include: ["src/**/*.ts"],
            exclude: ["node_modules"],
            failOnSeverity: "high" as const,
            rules: {
                "": "high",
            },
        };

        const report = await validateConfiguration(config, mockContext);

        expect(report.report.valid).toBe(false);
        expect(report.report.issues.some(i =>
            i.severity === "error" && i.message.includes("empty rule name") && i.code === "error-empty-rule-name"
        )).toBe(true);
    });

    it("should accept valid rule configurations", async () => {
        const config = {
            include: ["src/**/*.ts"],
            exclude: ["node_modules"],
            failOnSeverity: "high" as const,
            rules: {
                "no-console": "moderate",
                "no-debugger": "high",
                "eqeqeq": {
                    severity: "high",
                    options: { mode: "smart" },
                },
            },
        };

        const report = await validateConfiguration(config, mockContext);

        expect(report.report.valid).toBe(true);
    });
});

// ==============================================================================
// PROPERTY: PROFILE VALIDATION
// ==============================================================================
describe("Property: Profile Validation (Merged Config)", () => {
    const mockContext = createMockContext();

    it("should validate profile with all base errors inherited", async () => {
        const config = {
            include: ["**/*.invalid["], // Invalid glob
            exclude: ["node_modules"],
            failOnSeverity: "ultra-high" as any, // Invalid severity
            maxWorkers: -4, // Invalid range
            rules: {},
            profiles: {
                dev: {
                    watch: "yes" as any, // Invalid type
                },
            },
        };

        const report = await validateConfiguration(config, mockContext);

        // Should have base errors + profile-specific errors
        expect(report.report.valid).toBe(false);
        expect(report.report.issues.length).toBeGreaterThan(1);
    });
});

// ==============================================================================
// PROPERTY: COMPLETE VALID CONFIG
// ==============================================================================
describe("Property: Valid Configuration Acceptance", () => {
    it("should accept a fully valid configuration", async () => {
        const mockContext = createMockContext({
            fs: {
                existsSync: () => true,
                accessSync: () => { },
            },
        });

        const config = {
            include: ["src/**/*.ts", "lib/**/*.tsx"],
            exclude: ["node_modules/**", "dist/**", "**/*.d.ts"],
            failOnSeverity: "high" as const,
            maxWorkers: 4,
            maxWarnings: 10,
            watch: false,
            watchOptions: {
                debounce: 500,
                ignored: ["node_modules", "dist"],
            },
            autoFix: false,
            autoFixOnSave: false,
            outputFormat: "json" as const,
            outputPath: "./reports/analysis.json",
            reportUnusedDisableDirectives: true,
            ignorePatterns: ["**/*.min.js", "**/*.generated.ts"],
            cache: {
                enabled: true,
                location: "./.compass-cache",
                strategy: "local" as const,
                ttl: 3600000,
            },
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: ".",
                sourceType: "module" as const,
                ecmaVersion: 2021,
            },
            rules: {
                "no-console": "moderate",
                "no-debugger": "high",
                "no-var": "high",
                "prefer-const": "moderate",
                "eqeqeq": {
                    severity: "high" as const,
                    options: { mode: "smart" },
                },
            },
            profiles: {
                strict: {
                    failOnSeverity: "moderate" as const,
                    maxWarnings: 0,
                },
                dev: {
                    failOnSeverity: "critical" as const,
                    watch: true,
                },
            },
        };

        const report = await validateConfiguration(config, mockContext);

        expect(report.report.valid).toBe(true);
        expect(report.report.issues.filter(i => i.severity === "error")).toHaveLength(0);
        expect(report.report.issues.filter(i => i.severity === "warning")).toHaveLength(0);
    });
});