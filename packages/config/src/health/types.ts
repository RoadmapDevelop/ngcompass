import { ConfigIssue } from "@ngcompass/common";
import { AnalyzerConfigSchema } from "../schemas/schema.js";

export type ValidatedConfig = ReturnType<typeof AnalyzerConfigSchema.parse>;
export type CacheConfig = ValidatedConfig["cache"];

export interface ValidationContext {
    profile?: string;
    fs: {
        existsSync: (path: string) => boolean;
        accessSync: (path: string, mode: number) => void;
    };
    os: {
        cpus: () => Array<{ model: string }>;
    };
    path: {
        dirname: (p: string) => string;
    };
}

export interface ConfigBlock {
    autoFix?: boolean;
    autoFixOnSave?: boolean;
    maxWorkers?: number;
    watchOptions?: { debounce?: number };
    cache?: CacheConfig;
}

export interface ConfigBlockValidation {
    issues: ConfigIssue[];
}

