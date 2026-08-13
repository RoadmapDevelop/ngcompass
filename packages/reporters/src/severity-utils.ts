import type { RuleSeverity } from '@ngcompass/common';
import type { SourcePosition } from './models/index.js';

const SEVERITY_PRIORITY: Readonly<Record<RuleSeverity, number>> = {
  error: 0,
  warn: 1,
  off: 2,
} as const;

export function isErrorSeverity(severity: RuleSeverity): boolean {
  return severity === 'error';
}

export function severityRank(severity: RuleSeverity): number {
  return SEVERITY_PRIORITY[severity] ?? Number.MAX_SAFE_INTEGER;
}

export function compareByPosition(
  a: SourcePosition,
  b: SourcePosition
): number {
  if (a.line !== b.line) return a.line - b.line;
  return a.column - b.column;
}
