import type { RuleResult } from '@ngcompass/common';
import type { Task } from '@ngcompass/planner';

export interface ExecutionWorkerData {
  rootDir: string;
  tasks: Task[];
}

export interface ExecutionWorkerResult {
  results: RuleResult[];
  errors: Array<{ task: Task; error: string }>;
}
