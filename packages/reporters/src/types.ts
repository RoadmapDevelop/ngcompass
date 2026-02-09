import type { ConfigReport } from '@ngcompass/common';
import { RuleResult } from '@ngcompass/core';

export interface ConfigReporter {
    report(report: ConfigReport): void;
}

export interface ResultSummary {
    totalFiles: number;
    totalTasks: number;
    totalErrors: number;
    totalWarnings: number;
    duration: number;
}

export interface Reporter {
    report(results: RuleResult[]): void;
    summary(stats: ResultSummary): void;
    error(error: Error): void;
}
