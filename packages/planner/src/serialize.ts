import type { ExecutionPlanOutput, Task, FileAnalysisUnit, RuleTask, FileInput } from "./types.js";
import { buildIndexes } from "./indexes.js";

interface CompactPlan {
    v: number;
    r: string[];
    o: any[];
    f: string[];
    h: string[];
    t: any[];
}

/**
 * Serializes ExecutionPlanOutput into a compact format.
 *
 * @param output - Full execution plan output
 * @returns Compact plan representation
 */
export const serializePlan = (output: ExecutionPlanOutput): CompactPlan => {
    const rules = new StringInterner();
    const files = new StringInterner();
    const hashes = new StringInterner();
    const options = new ReferenceInterner<any>();

    const units = Object.values(output.plan).map((unit) => serializeUnit(unit, rules, files, hashes, options));

    return {
        v: 1,
        r: rules.values(),
        o: options.values(),
        f: files.values(),
        h: hashes.values(),
        t: units,
    };
};

/**
 * Deserializes CompactPlan back to ExecutionPlanOutput.
 *
 * @param compact - Compact plan representation
 * @returns Fully reconstructed execution plan output
 */
export const deserializePlan = (compact: CompactPlan): ExecutionPlanOutput => {
    const { r: rules, o: options, f: files, h: hashes, t: units } = compact;

    const plan: Record<string, FileAnalysisUnit> = {};
    const allTasks: Task[] = [];

    for (const unitData of units) {
        const { filePath, fileType, fileHash, ruleTasks } = deserializeUnit(unitData, rules, files, hashes, options);

        plan[filePath] = {
            file: { path: filePath, type: fileType, hash: fileHash },
            tasks: ruleTasks,
        };

        for (const rt of ruleTasks) {
            allTasks.push(toTask(filePath, rt));
        }
    }

    const indexes = buildIndexes(plan, allTasks);
    return { tasks: allTasks, plan, indexes, skippedTasks: [] };
};

/**
 * Serializes a single FileAnalysisUnit.
 *
 * @param unit - FileAnalysisUnit
 * @param rules - Rule name interner
 * @param files - File path interner
 * @param hashes - Hash interner
 * @param options - Options interner (reference-based)
 * @returns Compact unit tuple
 */
const serializeUnit = (
    unit: FileAnalysisUnit,
    rules: StringInterner,
    files: StringInterner,
    hashes: StringInterner,
    options: ReferenceInterner<any>
): any[] => {
    const fileId = files.id(unit.file.path);
    const fileHashId = hashes.idOrMinusOne(unit.file.hash);

    const tasks = unit.tasks.map((task) => serializeRuleTask(task, rules, files, hashes, options));

    return [fileId, unit.file.type, fileHashId, tasks];
};

/**
 * Serializes a RuleTask into compact tuple representation.
 *
 * @param task - RuleTask
 * @param rules - Rule name interner
 * @param files - File path interner
 * @param hashes - Hash interner
 * @param options - Options interner
 * @returns Compact task tuple
 */
const serializeRuleTask = (
    task: RuleTask,
    rules: StringInterner,
    files: StringInterner,
    hashes: StringInterner,
    options: ReferenceInterner<any>
): any[] => {
    const ruleId = rules.id(task.ruleName);
    const optId = options.id(task.options);
    const cacheKeyId = hashes.idOrMinusOne(task.cacheKey);

    const ts = encodeInput(task.inputs.typescript, files, hashes);
    const tpl = task.inputs.template ? encodeInput(task.inputs.template, files, hashes) : undefined;
    const styles =
        task.inputs.styles && task.inputs.styles.length > 0
            ? task.inputs.styles.map((s) => encodeInput(s, files, hashes))
            : undefined;
    const spec = task.inputs.spec ? encodeInput(task.inputs.spec, files, hashes) : undefined;

    return [ruleId, task.severity, optId, cacheKeyId, ts, tpl, styles, spec];
};

/**
 * Encodes a FileInput as a compact tuple.
 *
 * @param input - FileInput
 * @param files - File path interner
 * @param hashes - Hash interner
 * @returns Compact input tuple [fileId, hashId, needsAstFlag]
 */
const encodeInput = (input: FileInput, files: StringInterner, hashes: StringInterner): number[] => {
    return [files.id(input.path), hashes.idOrMinusOne(input.hash), input.needsAst ? 1 : 0];
};

/**
 * Deserializes a compact unit tuple.
 *
 * @param unitData - Compact unit tuple
 * @param rules - Rule names
 * @param files - File paths
 * @param hashes - Hash strings
 * @param options - Options values
 * @returns Reconstructed unit data
 */
const deserializeUnit = (
    unitData: any[],
    rules: string[],
    files: string[],
    hashes: string[],
    options: any[]
): { filePath: string; fileType: any; fileHash: string; ruleTasks: RuleTask[] } => {
    const [fileId, fileType, fileHashId, tasksData] = unitData;

    const filePath = files[fileId];
    const fileHash = decodeHash(fileHashId, hashes);

    const ruleTasks: RuleTask[] = (tasksData as any[]).map((t) => deserializeRuleTask(t, rules, files, hashes, options));

    return { filePath, fileType, fileHash, ruleTasks };
};

/**
 * Deserializes a compact RuleTask tuple.
 *
 * @param tData - Compact task tuple
 * @param rules - Rule names
 * @param files - File paths
 * @param hashes - Hash strings
 * @param options - Options values
 * @returns RuleTask
 */
const deserializeRuleTask = (tData: any[], rules: string[], files: string[], hashes: string[], options: any[]): RuleTask => {
    const [ruleId, severity, optId, cacheKeyId, tsCompact, tplCompact, stylesCompact, specCompact] = tData;

    const ruleName = rules[ruleId];
    const ruleOptions = options[optId];
    const cacheKey = decodeHash(cacheKeyId, hashes);

    const inputs: any = { typescript: decodeInput(tsCompact, files, hashes) };
    if (tplCompact) inputs.template = decodeInput(tplCompact, files, hashes);
    if (stylesCompact) inputs.styles = (stylesCompact as any[]).map((d) => decodeInput(d, files, hashes));
    if (specCompact) inputs.spec = decodeInput(specCompact, files, hashes);

    return { ruleName, severity, options: ruleOptions, cacheKey, inputs };
};

/**
 * Decodes a compact input tuple into a FileInput.
 *
 * @param d - Compact tuple [fileId, hashId, needsAstFlag]
 * @param files - File paths
 * @param hashes - Hash strings
 * @returns FileInput
 */
const decodeInput = (d: number[], files: string[], hashes: string[]): FileInput => {
    return {
        path: files[d[0]],
        hash: decodeHash(d[1], hashes),
        needsAst: d[2] === 1,
    };
};

/**
 * Decodes a hash ID into a string.
 *
 * @param hashId - Hash ID or -1
 * @param hashes - Hash table
 * @returns Hash string or empty
 */
const decodeHash = (hashId: number, hashes: string[]): string => {
    return hashId >= 0 ? hashes[hashId] : "";
};

/**
 * Converts a RuleTask to a Task.
 *
 * @param filePath - File path
 * @param ruleTask - RuleTask
 * @returns Task
 */
const toTask = (filePath: string, ruleTask: RuleTask): Task => {
    return {
        taskId: ruleTask.cacheKey,
        filePath,
        ruleName: ruleTask.ruleName,
        severity: ruleTask.severity,
        options: ruleTask.options,
        inputs: ruleTask.inputs,
    };
};

/**
 * Interns strings and returns stable numeric IDs.
 */
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

/**
 * Interns objects by reference identity.
 */
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

