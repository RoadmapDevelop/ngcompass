import type { BaselineFile, RuleFailure, RuleResult } from '@ngcompass/common';
import type {
  BaselineOutcome,
  BaselineScope,
  StaleEntry,
} from '../models/index.js';
import { toBaselineKey } from '../paths.js';
import { reconcileRenames } from './reconcile.js';

const PAIR_SEPARATOR = String.fromCharCode(0);

export function applyBaseline(
  results: ReadonlyArray<RuleResult>,
  baseline: BaselineFile,
  scope: BaselineScope,
  rootDir: string
): BaselineOutcome {
  const scannedKeys = toScannedKeys(scope.files, rootDir);
  const reconciled = reconcileRenames(baseline, scannedKeys);
  const failuresByPair = groupFailures(results, rootDir);

  const suppressed = new Set<RuleFailure>();
  const overAllowance = new Map<RuleFailure, string>();
  let suppressedCount = 0;
  const staleEntries: StaleEntry[] = [];

  for (const fileKey of Object.keys(reconciled.entries)) {
    if (!scannedKeys.has(fileKey)) continue;
    const counts = reconciled.entries[fileKey];

    for (const ruleName of Object.keys(counts)) {
      if (!scope.rules.has(ruleName)) continue;

      const recorded = counts[ruleName];
      const failures = failuresByPair.get(toPairKey(fileKey, ruleName)) ?? [];

      if (failures.length > recorded) {
        failures.sort(compareFailures);
      }

      const hidden = Math.min(recorded, failures.length);
      for (let i = 0; i < hidden; i++) {
        suppressed.add(failures[i]);
      }
      suppressedCount += hidden;

      if (failures.length > recorded) {
        const note = buildAllowanceNote(recorded, failures.length);
        for (let i = hidden; i < failures.length; i++) {
          overAllowance.set(failures[i], note);
        }
      }

      if (recorded > failures.length) {
        staleEntries.push({
          filePath: fileKey,
          ruleName,
          recorded,
          found: failures.length,
        });
      }
    }
  }

  const isUnchanged = suppressed.size === 0 && overAllowance.size === 0;

  return {
    results: isUnchanged
      ? results
      : rebuild(results, suppressed, overAllowance),
    suppressedCount,
    staleEntries,
    renamed: reconciled.renamed,
    unmatchedFiles: reconciled.unmatchedFiles,
    ambiguousFiles: reconciled.ambiguousFiles,
  };
}

function toScannedKeys(
  files: ReadonlySet<string>,
  rootDir: string
): Set<string> {
  const keys = new Set<string>();
  for (const file of files) {
    keys.add(toBaselineKey(file, rootDir));
  }
  return keys;
}

function groupFailures(
  results: ReadonlyArray<RuleResult>,
  rootDir: string
): Map<string, RuleFailure[]> {
  const grouped = new Map<string, RuleFailure[]>();
  const keyCache = new Map<string, string>();

  for (const result of results) {
    for (const failure of result.failures) {
      let fileKey = keyCache.get(failure.filePath);
      if (fileKey === undefined) {
        fileKey = toBaselineKey(failure.filePath, rootDir);
        keyCache.set(failure.filePath, fileKey);
      }

      const pairKey = toPairKey(fileKey, failure.ruleName);
      const existing = grouped.get(pairKey);
      if (existing) existing.push(failure);
      else grouped.set(pairKey, [failure]);
    }
  }

  return grouped;
}

function rebuild(
  results: ReadonlyArray<RuleResult>,
  suppressed: ReadonlySet<RuleFailure>,
  overAllowance: ReadonlyMap<RuleFailure, string>
): RuleResult[] {
  const rebuilt: RuleResult[] = [];

  for (const result of results) {
    const kept: RuleFailure[] = [];
    let isChanged = false;

    for (const failure of result.failures) {
      if (suppressed.has(failure)) {
        isChanged = true;
        continue;
      }

      const note = overAllowance.get(failure);
      if (note === undefined) {
        kept.push(failure);
        continue;
      }

      kept.push({ ...failure, message: `${failure.message} ${note}` });
      isChanged = true;
    }

    if (!isChanged) {
      rebuilt.push(result);
      continue;
    }
    if (kept.length === 0) continue;

    rebuilt.push({ ...result, failures: kept });
  }

  return rebuilt;
}

function buildAllowanceNote(recorded: number, found: number): string {
  return `This file exceeds its baseline allowance of ${recorded.toLocaleString()} for this rule (found ${found.toLocaleString()}).`;
}

function toPairKey(fileKey: string, ruleName: string): string {
  return `${fileKey}${PAIR_SEPARATOR}${ruleName}`;
}

function compareFailures(a: RuleFailure, b: RuleFailure): number {
  if (a.line !== b.line) return a.line - b.line;
  if (a.column !== b.column) return a.column - b.column;
  return a.message.localeCompare(b.message);
}
