import type { RuleSeverity } from '@ngcompass/common';
import type { FileInput } from './file.js';

export interface TaskInputs {
  typescript: FileInput;

  template?: FileInput;

  styles?: ReadonlyArray<FileInput>;

  spec?: FileInput;
}

export interface RuleTask {
  readonly ruleName: string;

  readonly severity: RuleSeverity;

  readonly options: Readonly<Record<string, unknown>>;

  readonly cacheKey: string;

  readonly inputs: TaskInputs;

  readonly needsTypeChecker?: boolean;

  readonly needsProjectContext?: boolean;
}

export interface Task {
  readonly taskId: string;

  readonly ruleName: string;

  readonly filePath: string;

  readonly severity: RuleSeverity;

  readonly options: Readonly<Record<string, unknown>>;

  readonly inputs: TaskInputs;

  readonly needsTypeChecker?: boolean;

  readonly needsProjectContext?: boolean;
}
