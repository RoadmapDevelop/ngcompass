import path from 'node:path';
import process from 'node:process';
import type { RuleResult, RuleFailure, RuleSeverity } from '@ngcompass/common';
import type { ParseError, Reporter, ResultSummary } from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';
import { compareByPosition, isErrorSeverity } from '../severity-utils.js';

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';

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
): SarifReport {
    const notifications = parseErrors.map(toParseErrorNotification);
    const invocation = notifications.length > 0
        ? [{
            executionSuccessful: true,
            toolExecutionNotifications: notifications,
        }]
        : undefined;

    return {
        version: SARIF_VERSION,
        $schema: SARIF_SCHEMA,
        runs: [{
            tool: {
                driver: {
                    name: 'ngcompass',
                    informationUri: 'https://github.com/SigoudisEftimis/ngcompass_',
                    rules: collectRules(results),
                },
            },
            results: collectResults(results),
            ...(invocation ? { invocations: invocation } : {}),
        }],
    };
}

export class SarifReporter implements Reporter {
    private readonly parseErrorBuffer: ParseError[] = [];

    constructor(private readonly out: ReporterOutput = processOutput) {}

    report(results: ReadonlyArray<RuleResult>): void {
        this.out.write(JSON.stringify(buildSarifReport(results, this.parseErrorBuffer), null, 2));
    }

    parseErrors(errors: ReadonlyArray<ParseError>): void {
        for (const error of errors) {
            this.parseErrorBuffer.push(error);
        }
    }

    error(error: Error): void {
        this.out.error(JSON.stringify({ error: error.message }, null, 2));
    }

    summary(_stats: ResultSummary): void {}
    step(_message: string): void {}
    info(_message: string): void {}
    debug(_message: string): void {}
}
