import type { BaselineFile } from '@ngcompass/common';
import type { ReconcileOutcome, RenameMatch } from '../models/index.js';
import { baseNameOf } from '../paths.js';

export function reconcileRenames(
  baseline: BaselineFile,
  scannedKeys: ReadonlySet<string>
): ReconcileOutcome {
  const missingByBaseName = new Map<string, string[]>();
  const entries: Record<string, Record<string, number>> = {};

  for (const fileKey of Object.keys(baseline.entries)) {
    if (scannedKeys.has(fileKey)) {
      entries[fileKey] = { ...baseline.entries[fileKey] };
      continue;
    }
    const baseName = baseNameOf(fileKey);
    const existing = missingByBaseName.get(baseName);
    if (existing) existing.push(fileKey);
    else missingByBaseName.set(baseName, [fileKey]);
  }

  if (missingByBaseName.size === 0) {
    return {
      entries,
      renamed: [],
      unmatchedFiles: [],
      ambiguousFiles: [],
    };
  }

  const candidatesByBaseName = collectCandidates(baseline, scannedKeys);
  const renamed: RenameMatch[] = [];
  const unmatchedFiles: string[] = [];
  const ambiguousFiles: string[] = [];

  for (const [baseName, missing] of missingByBaseName) {
    const candidates = candidatesByBaseName.get(baseName) ?? [];

    if (candidates.length === 0) {
      unmatchedFiles.push(...missing);
      continue;
    }

    if (missing.length > 1 || candidates.length > 1) {
      ambiguousFiles.push(...missing);
      continue;
    }

    const from = missing[0];
    const to = candidates[0];
    entries[to] = { ...baseline.entries[from] };
    renamed.push({ from, to });
  }

  return {
    entries,
    renamed: renamed.sort(compareRenames),
    unmatchedFiles: unmatchedFiles.sort(),
    ambiguousFiles: ambiguousFiles.sort(),
  };
}

function collectCandidates(
  baseline: BaselineFile,
  scannedKeys: ReadonlySet<string>
): Map<string, string[]> {
  const candidates = new Map<string, string[]>();

  for (const fileKey of scannedKeys) {
    if (baseline.entries[fileKey]) continue;
    const baseName = baseNameOf(fileKey);
    const existing = candidates.get(baseName);
    if (existing) existing.push(fileKey);
    else candidates.set(baseName, [fileKey]);
  }

  return candidates;
}

function compareRenames(a: RenameMatch, b: RenameMatch): number {
  return a.from.localeCompare(b.from);
}
