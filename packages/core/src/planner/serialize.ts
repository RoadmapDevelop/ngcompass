import {
    ExecutionPlanOutput,
    Task,
    FileAnalysisUnit,
    RuleTask,
    FileInput,
} from './types.js';
import { buildIndexes } from './indexes.js';

interface CompactPlan {
    v: number; // version
    r: string[]; // rules
    o: any[]; // options (objects)
    f: string[]; // files
    h: string[]; // hashes
    t: any[]; // tasks data (structured but dense)
}

/**
 * Serializes ExecutionPlanOutput into a compact, V8-friendly format.
 * - Deduplicates strings (rules, options, paths, hashes)
 * - Removes redundant tasks array and indexes
 * - flattens structure where possible
 */
export const serializePlan = (output: ExecutionPlanOutput): CompactPlan => {
    const rulesMap = new Map<string, number>();
    const optionsMap = new Map<any, number>();
    const filesMap = new Map<string, number>();
    const hashesMap = new Map<string, number>();

    const getRuleId = (r: string) => {
        let id = rulesMap.get(r);
        if (id === undefined) {
            id = rulesMap.size;
            rulesMap.set(r, id);
        }
        return id;
    };

    const getOptionsId = (o: any) => {
        // Dedup by reference (safe for non-JSON values like Regex)
        let id = optionsMap.get(o);
        if (id === undefined) {
            id = optionsMap.size;
            optionsMap.set(o, id);
        }
        return id;
    };

    const getFileId = (f: string) => {
        let id = filesMap.get(f);
        if (id === undefined) {
            id = filesMap.size;
            filesMap.set(f, id);
        }
        return id;
    };

    // Hash deduplication is optional but good for cache keys
    const getHashId = (h: string) => {
        if (!h) return -1;
        let id = hashesMap.get(h);
        if (id === undefined) {
            id = hashesMap.size;
            hashesMap.set(h, id);
        }
        return id;
    };

    // We iterate over the PLAN (grouped by file), not tasks, to save space.
    // plan is Record<string, FileAnalysisUnit>
    const fileUnits = Object.values(output.plan);
    const compactUnits = fileUnits.map(unit => {
        const fileId = getFileId(unit.file.path);
        const fileHashId = getHashId(unit.file.hash);

        const tasks = unit.tasks.map(task => {
            const ruleId = getRuleId(task.ruleName);
            const optId = getOptionsId(task.options);
            const keyHashId = getHashId(task.cacheKey);

            // Inputs
            const ts = task.inputs.typescript;
            const tsCompact = [getFileId(ts.path), getHashId(ts.hash), ts.needsAst ? 1 : 0];

            let tplCompact: number[] | undefined;
            if (task.inputs.template) {
                const t = task.inputs.template;
                tplCompact = [getFileId(t.path), getHashId(t.hash), t.needsAst ? 1 : 0];
            }

            let stylesCompact: number[][] | undefined;
            if (task.inputs.styles && task.inputs.styles.length > 0) {
                stylesCompact = task.inputs.styles.map(s => [getFileId(s.path), getHashId(s.hash), s.needsAst ? 1 : 0]);
            }

            let specCompact: number[] | undefined;
            if (task.inputs.spec) {
                const s = task.inputs.spec;
                specCompact = [getFileId(s.path), getHashId(s.hash), s.needsAst ? 1 : 0];
            }

            // Compact Task format:
            // [ruleId, severity, optId, keyHashId, tsCompact, tplCompact, stylesCompact, specCompact]
            return [
                ruleId,
                task.severity,
                optId,
                keyHashId,
                tsCompact,
                tplCompact,
                stylesCompact,
                specCompact
            ];
        });

        // Compact Unit format:
        // [fileId, fileType, fileHashId, tasks]
        return [
            fileId,
            unit.file.type,
            fileHashId,
            tasks
        ];
    });

    // Convert maps to arrays
    const rules = Array.from(rulesMap.keys());
    const options = Array.from(optionsMap.keys());
    const files = Array.from(filesMap.keys());
    const hashes = Array.from(hashesMap.keys());

    return {
        v: 1,
        r: rules,
        o: options,
        f: files,
        h: hashes,
        t: compactUnits
    };
};

/**
 * Deserializes CompactPlan back to ExecutionPlanOutput.
 * Reconstructs the full object graph including tasks array and indexes.
 */
export const deserializePlan = (compact: CompactPlan): ExecutionPlanOutput => {
    const { r: rules, o: options, f: files, h: hashes, t: units } = compact;

    const plan: Record<string, FileAnalysisUnit> = {};
    const allTasks: Task[] = [];

    // Reconstruct FileAnalysisUnits
    units.forEach((unitData: any[]) => {
        const [fileId, fileType, fileHashId, tasksData] = unitData;
        const filePath = files[fileId];
        const fileHash = fileHashId >= 0 ? hashes[fileHashId] : '';

        const ruleTasks: RuleTask[] = tasksData.map((tData: any[]) => {
            const [
                ruleId, severity, optId, keyHashId,
                tsCompact, tplCompact, stylesCompact, specCompact
            ] = tData;

            const ruleName = rules[ruleId];
            const ruleOptions = options[optId]; // Use options directly
            const cacheKey = keyHashId >= 0 ? hashes[keyHashId] : '';

            const decodeInput = (d: number[]): FileInput => ({
                path: files[d[0]],
                hash: d[1] >= 0 ? hashes[d[1]] : '',
                needsAst: d[2] === 1
            });

            const inputs: any = {
                typescript: decodeInput(tsCompact)
            };

            if (tplCompact) inputs.template = decodeInput(tplCompact);
            if (stylesCompact) inputs.styles = stylesCompact.map((d: number[]) => decodeInput(d));
            if (specCompact) inputs.spec = decodeInput(specCompact);

            return {
                ruleName,
                severity,
                options: ruleOptions,
                cacheKey,
                inputs
            };
        });

        plan[filePath] = {
            file: {
                path: filePath,
                type: fileType,
                hash: fileHash
            },
            tasks: ruleTasks
        };

        // Reconstruct Tasks for allTasks array
        ruleTasks.forEach(ruleTask => {
            allTasks.push({
                taskId: ruleTask.cacheKey,
                filePath,
                ruleName: ruleTask.ruleName,
                severity: ruleTask.severity,
                options: ruleTask.options,
                inputs: ruleTask.inputs
            });
        });
    });

    // Rebuild indexes
    const indexes = buildIndexes(plan, allTasks);

    return {
        tasks: allTasks,
        plan,
        indexes
    };
};
