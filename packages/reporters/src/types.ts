import type { ConfigReport, HealthReport, InitResult } from '@ngcompass/common';
import type { RuleFailure, RuleResult, RuleSeverity } from '@ngcompass/core';

export type { RuleFailure, RuleResult, RuleSeverity };

export type ReporterFormat = 'console' | 'json';

export interface ConsoleReporterOptions {
    readonly verbose?: boolean;
}

export interface ResultSummary {
    readonly totalFiles: number;
    readonly totalTasks: number;
    readonly cachedTasks?: number;
    readonly totalErrors: number;
    readonly totalWarnings: number;
    readonly duration: number;
}

export interface Reporter {
    report(results: RuleResult[]): void;
    summary(stats: ResultSummary): void;
    error(error: Error): void;
    step(message: string): void;
    info(message: string): void;
    debug(message: string): void;
    parseErrors(errors: { filePath: string; message: string }[]): void;
}

export interface ConfigReporter {
    report(report: ConfigReport): void;
    renderInitResult(result: InitResult): void;
    renderHealthReport(report: HealthReport): void;
}

export interface EslintMessage {
    readonly ruleId: string;
    readonly severity: 1 | 2;
    readonly message: string;
    readonly line: number;
    readonly column: number;
}

export interface EslintFileResult {
    readonly filePath: string;
    readonly messages: EslintMessage[];
    readonly errorCount: number;
    readonly warningCount: number;
}
