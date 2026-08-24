import type {
  BaselineFile,
  BaselineReport,
  BaselineRuleFile,
  BaselineRuleSummary,
} from '@ngcompass/common';

export function summarizeBaseline(
  baseline: BaselineFile,
  baselinePath: string,
  filesPerRule: number
): BaselineReport {
  const filesByRule = groupFilesByRule(baseline);

  let totalViolations = 0;
  for (const files of filesByRule.values()) {
    for (const file of files) {
      totalViolations += file.count;
    }
  }

  const rules: BaselineRuleSummary[] = [];
  for (const [ruleName, files] of filesByRule) {
    files.sort(compareFiles);

    let total = 0;
    for (const file of files) {
      total += file.count;
    }

    const shown = filesPerRule > 0 ? files.slice(0, filesPerRule) : files;
    rules.push({
      ruleName,
      total,
      share: totalViolations === 0 ? 0 : total / totalViolations,
      fileCount: files.length,
      files: shown,
      omittedFiles: files.length - shown.length,
    });
  }

  return {
    path: baselinePath,
    totalFiles: Object.keys(baseline.entries).length,
    totalViolations,
    rules: rules.sort(compareRules),
  };
}

function groupFilesByRule(
  baseline: BaselineFile
): Map<string, BaselineRuleFile[]> {
  const byRule = new Map<string, BaselineRuleFile[]>();

  for (const filePath of Object.keys(baseline.entries)) {
    const counts = baseline.entries[filePath];

    for (const ruleName of Object.keys(counts)) {
      const entry = { filePath, count: counts[ruleName] };
      const existing = byRule.get(ruleName);
      if (existing) existing.push(entry);
      else byRule.set(ruleName, [entry]);
    }
  }

  return byRule;
}

function compareFiles(a: BaselineRuleFile, b: BaselineRuleFile): number {
  if (a.count !== b.count) return b.count - a.count;
  return a.filePath.localeCompare(b.filePath);
}

function compareRules(a: BaselineRuleSummary, b: BaselineRuleSummary): number {
  if (a.total !== b.total) return b.total - a.total;
  return a.ruleName.localeCompare(b.ruleName);
}
