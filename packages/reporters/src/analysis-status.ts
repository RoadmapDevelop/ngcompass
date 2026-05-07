import type { ResultSummary } from './types.js';

export type AnalysisStatus = 'passed' | 'passed-with-warnings' | 'failed';

export interface AnalysisStatusInfo {
    readonly status: AnalysisStatus;
    readonly label: 'PASS' | 'PASS WITH WARNINGS' | 'FAILED';
}

export function getAnalysisStatus(summary: Pick<ResultSummary, 'totalErrors' | 'totalWarnings' | 'failOnSeverity' | 'maxWarnings'>): AnalysisStatusInfo {
    const failOnSeverity = summary.failOnSeverity ?? 'error';
    const maxWarnings = summary.maxWarnings ?? 10;

    if (
        summary.totalErrors > 0 ||
        (failOnSeverity === 'warn' && summary.totalWarnings > 0) ||
        summary.totalWarnings > maxWarnings
    ) {
        return { status: 'failed', label: 'FAILED' };
    }

    if (summary.totalWarnings > 0) {
        return { status: 'passed-with-warnings', label: 'PASS WITH WARNINGS' };
    }

    return { status: 'passed', label: 'PASS' };
}
