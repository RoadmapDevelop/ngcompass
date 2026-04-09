import * as fs from "node:fs";
import * as path from "node:path";
import { cpus } from "node:os";
import process from "node:process";
import { ValidationContext } from "./types.js";

export function createDefaultContext(overrides?: Partial<ValidationContext>): ValidationContext {
    return {
        cwd: process.cwd(),
        fs: {
            existsSync: fs.existsSync,
            accessSync: (p: string, mode: number) => fs.accessSync(p, mode),
        },
        os: { cpus },
        path: { dirname: path.dirname },
        ...overrides,
    };
}

