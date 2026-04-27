import { ConfigIssue } from "@ngcompass/common";
import { AnalyzerConfigSchema } from "../schemas/schema.js";

export type ValidatedConfig = ReturnType<typeof AnalyzerConfigSchema.parse>;
export type CacheConfig = ValidatedConfig["cache"];

export interface ValidationContext {
    profile?: string;
    /** Working directory used for module resolution (e.g. extends chain). Defaults to process.cwd(). */
    cwd?: string;
    fs: {
        existsSync: (path: string) => boolean;
        accessSync: (path: string, mode: number) => void;
    };
    os: {
        cpus: () => Array<{ model: string }>;
    };
    path: {
        dirname: (p: string) => string;
        resolve: (...paths: string[]) => string;
        isAbsolute: (p: string) => boolean;
    };
}

export interface ConfigBlock {
    maxWorkers?: number;
    cache?: CacheConfig;
}

export interface ConfigBlockValidation {
    issues: ConfigIssue[];
}

