import path from 'node:path';
import pc from 'picocolors';
import { formatDuration, pluralise } from '@ngcompass/common';
import type { AnalysisFileProgress } from '@ngcompass/engine';
import type { ExecutionPlanOutput } from '@ngcompass/planner';

interface FilePhaseAccumulator {
  taskCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  duration: number;
}

const ZERO_ACC: FilePhaseAccumulator = {
  taskCount: 0,
  issueCount: 0,
  errorCount: 0,
  warningCount: 0,
  duration: 0,
};

function buildExpectedMap(
  plan: ExecutionPlanOutput,
  typeAware: boolean
): Map<string, number> {
  const map = new Map<string, number>();
  for (const task of plan.tasks) {
    const fp = task.filePath;
    if (typeof fp !== 'string' || fp.length === 0) continue;
    const taskIsTypeAware = task.needsTypeChecker || task.needsProjectContext;
    if (taskIsTypeAware !== typeAware) continue;
    map.set(fp, (map.get(fp) ?? 0) + 1);
  }
  return map;
}

function mergeAcc(
  prev: FilePhaseAccumulator | undefined,
  event: AnalysisFileProgress
): FilePhaseAccumulator {
  const base = prev ?? ZERO_ACC;
  return {
    taskCount: base.taskCount + event.taskCount,
    issueCount: base.issueCount + event.issueCount,
    errorCount: base.errorCount + event.errorCount,
    warningCount: base.warningCount + event.warningCount,
    duration: base.duration + event.duration,
  };
}

function combineAcc(
  a: FilePhaseAccumulator | undefined,
  b: FilePhaseAccumulator
): FilePhaseAccumulator {
  if (!a) return b;
  return {
    taskCount: a.taskCount + b.taskCount,
    issueCount: a.issueCount + b.issueCount,
    errorCount: a.errorCount + b.errorCount,
    warningCount: a.warningCount + b.warningCount,
    duration: a.duration + b.duration,
  };
}

function formatProgressLine(
  relativePath: string,
  acc: FilePhaseAccumulator
): string {
  const hasIssues = acc.issueCount > 0;
  const status = hasIssues ? pc.red('❯') : pc.green('❯');
  const dur = hasIssues
    ? pc.red(formatDuration(acc.duration))
    : pc.green(formatDuration(acc.duration));
  if (hasIssues) {
    const issues = `${acc.issueCount.toLocaleString()} ${pluralise(acc.issueCount, 'issue')}`;
    return `${status} ${pc.red(relativePath)}  ${dur}   ${pc.red(issues)}`;
  }
  return `${status} ${pc.dim(relativePath)}  ${dur}`;
}

export function createFileProgressLogger(
  plan: ExecutionPlanOutput,
  writeLine: (line: string) => void,
  cwd: string
): (event: AnalysisFileProgress) => void {
  const syntaxExpected = buildExpectedMap(plan, false);
  const typeAwareExpected = buildExpectedMap(plan, true);

  const syntaxDone = new Map<string, FilePhaseAccumulator>();
  const typeAwareDone = new Map<string, FilePhaseAccumulator>();
  const syntaxPrinted = new Set<string>();
  const finalPrinted = new Set<string>();

  const print = (
    filePath: string,
    acc: FilePhaseAccumulator,
    isFinal: boolean
  ): void => {
    if (finalPrinted.has(filePath)) return;
    const guard = isFinal ? finalPrinted : syntaxPrinted;
    if (guard.has(filePath)) return;
    guard.add(filePath);
    const relativePath = path.relative(cwd, filePath) || filePath;
    writeLine(formatProgressLine(relativePath, acc));
  };

  return (event: AnalysisFileProgress): void => {
    const fp = event.filePath;
    if (finalPrinted.has(fp)) return;

    if (event.typeAware === false) {
      const acc = mergeAcc(syntaxDone.get(fp), event);
      syntaxDone.set(fp, acc);
      const expected = syntaxExpected.get(fp) ?? acc.taskCount;
      if (acc.taskCount < expected) return;
      print(fp, acc, !typeAwareExpected.has(fp));
      return;
    }

    if (event.typeAware === true) {
      const acc = mergeAcc(typeAwareDone.get(fp), event);
      typeAwareDone.set(fp, acc);
      const expected = typeAwareExpected.get(fp) ?? acc.taskCount;
      if (acc.taskCount < expected) return;
      print(fp, combineAcc(syntaxDone.get(fp), acc), true);
      return;
    }

    const totalExpected =
      (syntaxExpected.get(fp) ?? 0) + (typeAwareExpected.get(fp) ?? 0);
    const acc = mergeAcc(syntaxDone.get(fp), event);
    syntaxDone.set(fp, acc);
    if (acc.taskCount < (totalExpected || acc.taskCount)) return;
    print(fp, acc, true);
  };
}
