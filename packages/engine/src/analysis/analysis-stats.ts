import type {
  AnalysisResult,
  RuleFailure,
  RuleResult,
  RuleSeverity,
} from '@ngcompass/common';

export function calculateStats(
  results: ReadonlyArray<RuleResult>,
  startTime: number,
  cacheHitRate?: number
): AnalysisResult['stats'] {
  const duration = performance.now() - startTime;
  const failures = results.flatMap((r) => r.failures);

  const uniqueFiles = new Set<string>(
    failures.map((f: RuleFailure) => f.filePath)
  );

  let totalErrors = 0;
  let totalWarnings = 0;
  for (const failure of failures) {
    if (isErrorSeverity(failure.severity)) totalErrors++;
    else if (isWarningSeverity(failure.severity)) totalWarnings++;
  }

  return {
    totalFiles: uniqueFiles.size,
    totalErrors,
    totalWarnings,
    duration,
    cacheHitRate,
  };
}

const isErrorSeverity = (severity: RuleSeverity): boolean =>
  severity === 'error';

const isWarningSeverity = (severity: RuleSeverity): boolean =>
  severity === 'warn';
