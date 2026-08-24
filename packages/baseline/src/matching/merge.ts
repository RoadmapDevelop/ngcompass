import type { BaselineFile, RuleResult } from '@ngcompass/common';
import type { BaselineScope, PruneOutcome } from '../models/index.js';
import { toBaselineKey } from '../paths.js';
import { BASELINE_VERSION } from '../serialization/format.js';
import { reconcileRenames } from './reconcile.js';

export function mergeIntoBaseline(
  existing: BaselineFile,
  results: ReadonlyArray<RuleResult>,
  scope: BaselineScope,
  rootDir: string
): BaselineFile {
  const counts = countFailures(results, rootDir);
  const entries = copyEntries(existing);

  for (const file of scope.files) {
    const fileKey = toBaselineKey(file, rootDir);
    const found = counts.get(fileKey);

    for (const ruleName of scope.rules) {
      const count = found?.get(ruleName) ?? 0;
      const current = entries[fileKey];

      if (count > 0) {
        if (current) current[ruleName] = count;
        else entries[fileKey] = { [ruleName]: count };
        continue;
      }

      if (current) delete current[ruleName];
    }

    const updated = entries[fileKey];
    if (updated && Object.keys(updated).length === 0) {
      delete entries[fileKey];
    }
  }

  return { version: BASELINE_VERSION, entries };
}

export function pruneBaseline(
  existing: BaselineFile,
  results: ReadonlyArray<RuleResult>,
  scope: BaselineScope,
  rootDir: string
): PruneOutcome {
  const scannedKeys = new Set<string>();
  for (const file of scope.files) {
    scannedKeys.add(toBaselineKey(file, rootDir));
  }

  const reconciled = reconcileRenames(existing, scannedKeys);
  const baseline = mergeIntoBaseline(
    { version: BASELINE_VERSION, entries: reconciled.entries },
    results,
    scope,
    rootDir
  );

  const removedFiles = [
    ...reconciled.unmatchedFiles,
    ...reconciled.ambiguousFiles,
  ].sort();

  return { baseline, renamed: reconciled.renamed, removedFiles };
}

function countFailures(
  results: ReadonlyArray<RuleResult>,
  rootDir: string
): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  const keyCache = new Map<string, string>();

  for (const result of results) {
    for (const failure of result.failures) {
      let fileKey = keyCache.get(failure.filePath);
      if (fileKey === undefined) {
        fileKey = toBaselineKey(failure.filePath, rootDir);
        keyCache.set(failure.filePath, fileKey);
      }

      let perRule = counts.get(fileKey);
      if (!perRule) {
        perRule = new Map<string, number>();
        counts.set(fileKey, perRule);
      }

      perRule.set(failure.ruleName, (perRule.get(failure.ruleName) ?? 0) + 1);
    }
  }

  return counts;
}

function copyEntries(
  baseline: BaselineFile
): Record<string, Record<string, number>> {
  const entries: Record<string, Record<string, number>> = {};
  for (const fileKey of Object.keys(baseline.entries)) {
    entries[fileKey] = { ...baseline.entries[fileKey] };
  }
  return entries;
}
