import path from 'node:path';
import process from 'node:process';
import type { RuleResult, RuleFailure, RuleSeverity } from '@ngcompass/common';
import type { ParseError, Reporter, ResultSummary } from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';
import { compareByPosition, isErrorSeverity } from '../severity-utils.js';
import { getAnalysisStatus } from '../analysis-status.js';

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const TOOL_INFORMATION_URI = 'https://ngcompass.dev/docs';

type SarifLevel = 'error' | 'warning' | 'note';

interface SarifReport {
    readonly version: typeof SARIF_VERSION;
    readonly $schema: typeof SARIF_SCHEMA;
    readonly runs: readonly SarifRun[];
}

interface SarifRun {
    readonly tool: {
        readonly driver: {
            readonly name: string;
            readonly informationUri: string;
            readonly rules: readonly SarifRule[];
        };
    };
    readonly results: readonly SarifResult[];
    readonly invocations?: readonly SarifInvocation[];
    readonly properties?: {
        readonly ngcompass: {
            readonly status: string;
            readonly statusLabel: string;
            readonly totalViolations: number;
            readonly totalErrors: number;
            readonly totalWarnings: number;
            readonly failOnSeverity?: 'warn' | 'error';
            readonly maxWarnings?: number;
        };
    };
}

interface SarifRule {
    readonly id: string;
    readonly shortDescription: {
        readonly text: string;
    };
}

interface SarifResult {
    readonly ruleId: string;
    readonly level: SarifLevel;
    readonly message: {
        readonly text: string;
    };
    readonly locations: readonly SarifLocation[];
}

interface SarifLocation {
    readonly physicalLocation: {
        readonly artifactLocation: {
            readonly uri: string;
        };
        readonly region: {
            readonly startLine: number;
            readonly startColumn: number;
        };
    };
}

interface SarifInvocation {
    readonly executionSuccessful: boolean;
    readonly toolExecutionNotifications: readonly SarifNotification[];
}

interface SarifNotification {
    readonly level: SarifLevel;
    readonly message: {
        readonly text: string;
    };
    readonly locations: readonly SarifLocation[];
}

function toSarifLevel(severity: RuleSeverity): SarifLevel {
    return isErrorSeverity(severity) ? 'error' : 'warning';
}

function toArtifactUri(filePath: string): string {
    const relative = path.relative(process.cwd(), filePath);
    const artifactPath = relative && !relative.startsWith('..') && !path.isAbsolute(relative)
        ? relative
        : filePath;

    return artifactPath.replace(/\\/g, '/');
}

function toLocation(filePath: string, line: number, column: number): SarifLocation {
    return {
        physicalLocation: {
            artifactLocation: {
                uri: toArtifactUri(filePath),
            },
            region: {
                startLine: Math.max(1, line),
                startColumn: Math.max(1, column),
            },
        },
    };
}

function toSarifResult(failure: RuleFailure): SarifResult {
    return {
        ruleId: failure.ruleName,
        level: toSarifLevel(failure.severity),
        message: {
            text: failure.message,
        },
        locations: [
            toLocation(failure.filePath, failure.line, failure.column),
        ],
    };
}

function collectRules(results: ReadonlyArray<RuleResult>): SarifRule[] {
    const rules = new Map<string, SarifRule>();

    for (const result of results) {
        const firstFailure = result.failures[0];
        rules.set(result.ruleName, {
            id: result.ruleName,
            shortDescription: {
                text: firstFailure?.message ?? result.ruleName,
            },
        });
    }

    return [...rules.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function collectResults(results: ReadonlyArray<RuleResult>): SarifResult[] {
    return results
        .flatMap((result) => result.failures)
        .sort((a, b) => {
            const fileDiff = a.filePath.localeCompare(b.filePath);
            if (fileDiff !== 0) return fileDiff;
            return compareByPosition(a, b);
        })
        .map(toSarifResult);
}

function countViolations(results: ReadonlyArray<RuleResult>): number {
    return results.reduce((count, result) => count + result.failures.length, 0);
}

function toParseErrorNotification(error: ParseError): SarifNotification {
    return {
        level: 'warning',
        message: {
            text: error.message,
        },
        locations: [
            toLocation(error.filePath, 1, 1),
        ],
    };
}

function buildSarifReport(
    results: ReadonlyArray<RuleResult>,
    parseErrors: ReadonlyArray<ParseError>,
    summary: ResultSummary,
): SarifReport {
    const notifications = parseErrors.map(toParseErrorNotification);
    const invocation = notifications.length > 0
        ? [{
            executionSuccessful: true,
            toolExecutionNotifications: notifications,
        }]
        : undefined;
    const status = getAnalysisStatus(summary);

    return {
        version: SARIF_VERSION,
        $schema: SARIF_SCHEMA,
        runs: [{
            tool: {
                driver: {
                    name: 'ngcompass',
                    informationUri: TOOL_INFORMATION_URI,
                    rules: collectRules(results),
                },
            },
            results: collectResults(results),
            properties: {
                ngcompass: {
                    status: status.status,
                    statusLabel: status.label,
                    totalViolations: countViolations(results),
                    totalErrors: summary.totalErrors,
                    totalWarnings: summary.totalWarnings,
                    failOnSeverity: summary.failOnSeverity,
                    maxWarnings: summary.maxWarnings,
                },
            },
            ...(invocation ? { invocations: invocation } : {}),
        }],
    };
}

export class SarifReporter implements Reporter {
    private readonly parseErrorBuffer: ParseError[] = [];
    private readonly resultBuffer: RuleResult[] = [];

    constructor(private readonly out: ReporterOutput = processOutput) {}

    report(results: ReadonlyArray<RuleResult>): void {
        for (const result of results) this.resultBuffer.push(result);
    }

    parseErrors(errors: ReadonlyArray<ParseError>): void {
        for (const error of errors) {
            this.parseErrorBuffer.push(error);
        }
    }

    error(error: Error): void {
        this.out.error(JSON.stringify({ error: error.message }, null, 2));
    }

    summary(stats: ResultSummary): void {
        this.out.write(JSON.stringify(buildSarifReport(this.resultBuffer, this.parseErrorBuffer, stats), null, 2));
    }

    step(_message: string): void {}
    info(_message: string): void {}
    debug(_message: string): void {}
}
