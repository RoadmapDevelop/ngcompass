import { buildIndexes } from './indexes.js';
import type {
  ExecutionPlanOutput,
  FileAnalysisUnit,
  FileInput,
  RuleTask,
  Task,
} from './types.js';

const CURRENT_VERSION = 2;

type CompactOptionValue = Readonly<Record<string, unknown>>;
type CompactInput = [fileId: number, hashId: number, needsAstFlag: number];
type CompactRuleTask = [
  ruleId: number,
  severity: RuleTask['severity'],
  optId: number,
  cacheKeyId: number,
  ts: CompactInput,
  tpl?: CompactInput,
  styles?: CompactInput[],
  spec?: CompactInput,

  needsTypeChecker?: number,

  needsProjectContext?: number,
];
type CompactUnit = [
  fileId: number,
  fileType: FileAnalysisUnit['file']['type'],
  fileHashId: number,
  tasks: CompactRuleTask[],
];

interface CompactPlan {
  v: number;
  r: string[];
  o: CompactOptionValue[];
  f: string[];
  h: string[];
  t: CompactUnit[];
}

export const serializePlan = (output: ExecutionPlanOutput): CompactPlan => {
  const rules = new StringInterner();
  const files = new StringInterner();
  const hashes = new StringInterner();
  const options = new ReferenceInterner<CompactOptionValue>();

  const units = Object.values(output.plan).map((unit) =>
    serializeUnit(unit, rules, files, hashes, options)
  );

  return {
    v: CURRENT_VERSION,
    r: rules.values(),
    o: options.values(),
    f: files.values(),
    h: hashes.values(),
    t: units,
  };
};

export const deserializePlan = (compact: CompactPlan): ExecutionPlanOutput => {
  const { r: rules, o: options, f: files, h: hashes, t: units } = compact;

  const plan: Record<string, FileAnalysisUnit> = {};
  const allTasks: Task[] = [];

  for (const unitData of units) {
    const { filePath, fileType, fileHash, ruleTasks } = deserializeUnit(
      unitData,
      rules,
      files,
      hashes,
      options
    );
    plan[filePath] = {
      file: { path: filePath, type: fileType, hash: fileHash },
      tasks: ruleTasks,
    };
    for (const rt of ruleTasks) allTasks.push(toTask(filePath, rt));
  }

  const indexes = buildIndexes(plan, allTasks);
  return { tasks: allTasks, plan, indexes, skippedTasks: [] };
};

const serializeUnit = (
  unit: FileAnalysisUnit,
  rules: StringInterner,
  files: StringInterner,
  hashes: StringInterner,
  options: ReferenceInterner<CompactOptionValue>
): CompactUnit => {
  const fileId = files.id(unit.file.path);
  const fileHashId = hashes.idOrMinusOne(unit.file.hash);
  const tasks = unit.tasks.map((task) =>
    serializeRuleTask(task, rules, files, hashes, options)
  );
  return [fileId, unit.file.type, fileHashId, tasks];
};

const serializeRuleTask = (
  task: RuleTask,
  rules: StringInterner,
  files: StringInterner,
  hashes: StringInterner,
  options: ReferenceInterner<CompactOptionValue>
): CompactRuleTask => {
  const ruleId = rules.id(task.ruleName);
  const optId = options.id(task.options);
  const cacheKeyId = hashes.idOrMinusOne(task.cacheKey);

  const ts = encodeInput(task.inputs.typescript, files, hashes);
  const tpl = task.inputs.template
    ? encodeInput(task.inputs.template, files, hashes)
    : undefined;
  const styles =
    task.inputs.styles && task.inputs.styles.length > 0
      ? task.inputs.styles.map((s) => encodeInput(s, files, hashes))
      : undefined;
  const spec = task.inputs.spec
    ? encodeInput(task.inputs.spec, files, hashes)
    : undefined;
  const typeCheckerFlag = task.needsTypeChecker ? 1 : 0;
  const projectContextFlag = task.needsProjectContext ? 1 : 0;

  return [
    ruleId,
    task.severity,
    optId,
    cacheKeyId,
    ts,
    tpl,
    styles,
    spec,
    typeCheckerFlag,
    projectContextFlag,
  ];
};

const encodeInput = (
  input: FileInput,
  files: StringInterner,
  hashes: StringInterner
): CompactInput => [
  files.id(input.path),
  hashes.idOrMinusOne(input.hash),
  input.needsAst ? 1 : 0,
];

const deserializeUnit = (
  unitData: CompactUnit,
  rules: string[],
  files: string[],
  hashes: string[],
  options: CompactOptionValue[]
): {
  filePath: string;
  fileType: FileAnalysisUnit['file']['type'];
  fileHash: string;
  ruleTasks: RuleTask[];
} => {
  const [fileId, fileType, fileHashId, tasksData] = unitData;
  const filePath = files[fileId];
  const fileHash = decodeHash(fileHashId, hashes);
  const ruleTasks = tasksData.map((taskData) =>
    deserializeRuleTask(taskData, rules, files, hashes, options)
  );
  return { filePath, fileType, fileHash, ruleTasks };
};

const deserializeRuleTask = (
  tData: CompactRuleTask,
  rules: string[],
  files: string[],
  hashes: string[],
  options: CompactOptionValue[]
): RuleTask => {
  const [
    ruleId,
    severity,
    optId,
    cacheKeyId,
    tsCompact,
    tplCompact,
    stylesCompact,
    specCompact,
    typeCheckerFlag,
    projectContextFlag,
  ] = tData;

  const ruleName = rules[ruleId];
  const ruleOptions = options[optId];
  const cacheKey = decodeHash(cacheKeyId, hashes);

  const inputs: RuleTask['inputs'] = {
    typescript: decodeInput(tsCompact, files, hashes),
  };
  if (tplCompact) inputs.template = decodeInput(tplCompact, files, hashes);
  if (stylesCompact)
    inputs.styles = stylesCompact.map((s) => decodeInput(s, files, hashes));
  if (specCompact) inputs.spec = decodeInput(specCompact, files, hashes);

  return {
    ruleName,
    severity,
    options: ruleOptions,
    cacheKey,
    inputs,
    needsTypeChecker: typeCheckerFlag === 1 ? true : undefined,
    needsProjectContext: projectContextFlag === 1 ? true : undefined,
  };
};

const decodeInput = (
  d: CompactInput,
  files: string[],
  hashes: string[]
): FileInput => ({
  path: files[d[0]],
  hash: decodeHash(d[1], hashes),
  needsAst: d[2] === 1,
});

const decodeHash = (hashId: number, hashes: string[]): string =>
  hashId >= 0 ? hashes[hashId] : '';

const toTask = (filePath: string, ruleTask: RuleTask): Task => ({
  taskId: ruleTask.cacheKey,
  filePath,
  ruleName: ruleTask.ruleName,
  severity: ruleTask.severity,
  options: ruleTask.options,
  inputs: ruleTask.inputs,
  needsTypeChecker: ruleTask.needsTypeChecker,
  needsProjectContext: ruleTask.needsProjectContext,
});

class StringInterner {
  private readonly map = new Map<string, number>();
  private readonly list: string[] = [];

  public id(value: string): number {
    const existing = this.map.get(value);
    if (existing !== undefined) return existing;
    const next = this.list.length;
    this.map.set(value, next);
    this.list.push(value);
    return next;
  }

  public idOrMinusOne(value: string): number {
    if (!value) return -1;
    return this.id(value);
  }

  public values(): string[] {
    return this.list;
  }
}

class ReferenceInterner<T> {
  private readonly map = new Map<T, number>();
  private readonly list: T[] = [];

  public id(value: T): number {
    const existing = this.map.get(value);
    if (existing !== undefined) return existing;
    const next = this.list.length;
    this.map.set(value, next);
    this.list.push(value);
    return next;
  }

  public values(): T[] {
    return this.list;
  }
}

export { CURRENT_VERSION as PLAN_SCHEMA_VERSION };
