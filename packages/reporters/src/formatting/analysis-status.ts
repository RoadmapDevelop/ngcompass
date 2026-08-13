import type {
  AnalysisStatusInfo,
  ResultSummary,
} from '../models/index.js';
const DEFAULT_MAX_WARNINGS = 10;

export function getAnalysisStatus(
  summary: Pick<
    ResultSummary,
    'totalErrors' | 'totalWarnings' | 'failOnSeverity' | 'maxWarnings'
  >
): AnalysisStatusInfo {
  const failOnSeverity = summary.failOnSeverity ?? 'error';
  const maxWarnings = summary.maxWarnings ?? DEFAULT_MAX_WARNINGS;

  if (
    summary.totalErrors > 0 ||
    (failOnSeverity === 'warn' && summary.totalWarnings > 0) ||
    summary.totalWarnings > maxWarnings
  ) {
    return { status: 'failed', label: 'FAILED' };
  }

  if (summary.totalWarnings > 0) {
    return { status: 'passed-with-warnings', label: 'WARN' };
  }

  return { status: 'passed', label: 'PASS' };
}
