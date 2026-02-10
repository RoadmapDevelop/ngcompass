import type { ConfigReport, HealthReport, InitResult } from '@ngcompass/common';
import { RuleResult } from '@ngcompass/core';

export interface ConfigReporter {
    report(report: ConfigReport): void;
    renderInitResult(result: InitResult): void;
    renderHealthReport(report: HealthReport): void;
}

export interface ResultSummary {
    totalFiles: number;
    totalTasks: number;
    cachedTasks?: number;
    totalErrors: number;
    totalWarnings: number;
    duration: number;
}

export interface Reporter {
    report(results: RuleResult[]): void;
    summary(stats: ResultSummary): void;
    error(error: Error): void;
}
