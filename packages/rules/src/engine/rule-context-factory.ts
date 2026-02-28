/**
 * RuleContextFactory
 *
 * Constructs RuleContext objects for rule execution.
 * Extracted from runner.ts so that the context-building logic is:
 *  - Independently testable (inject a mock ExecutionContext)
 *  - Reusable across local executor and worker threads
 *  - Decoupled from I/O concerns
 *
 * Usage:
 * ```ts
 * const factory = new RuleContextFactory(analysisContext);
 * const ruleContext = await factory.build(filePath, options, needsTemplate);
 * ```
 *
 * Testing:
 * ```ts
 * const mockContext: ExecutionContext = {
 *   rootDir: '/test',
 *   readFile: async () => 'export class Foo {}',
 *   getProgram: async (p) => parseTs('export class Foo {}', p).program,
 *   getTemplate: async () => undefined,
 *   getStyle: async () => undefined,
 * };
 * const factory = new RuleContextFactory(mockContext);
 * const ctx = await factory.build('/test/foo.ts', {}, false);
 * ```
 */

import { Locator } from '../../utils/locator.js';
import type { RuleContext } from '@ngcompass/common';

export interface ExecutionContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<import('oxc-parser').Program>;
    readonly getTypeChecker?: (filePath: string) => Promise<import('typescript').TypeChecker | undefined>;
    readonly getTemplate: (filePath: string) => Promise<any | undefined>;
    readonly getStyle: (filePath: string) => Promise<any | undefined>;
}

// ============================================
// FACTORY CLASS
// ============================================

/**
 * Builds fully-resolved RuleContext objects.
 *
 * The factory takes an ExecutionContext (which owns file I/O and AST caching)
 * and assembles the RuleContext that rules receive. This keeps runner.ts free
 * of context construction boilerplate and makes unit testing straightforward.
 */
export class RuleContextFactory {
    constructor(private readonly context: ExecutionContext) { }

    /**
     * Builds a RuleContext for the given file.
     *
     * @param filePath      - Absolute path to the file being analysed
     * @param options       - Rule-specific options from the configuration
     * @param needsTemplate - Whether the rule(s) in this batch require the template
     * @returns A fully resolved RuleContext
     */
    async build(
        filePath: string,
        options: Record<string, unknown>,
        needsTemplate: boolean,
    ): Promise<RuleContext> {
        const [fileContent, program] = await Promise.all([
            this.context.readFile(filePath),
            this.context.getProgram(filePath),
        ]);

        const locator = new Locator(fileContent);

        let typeChecker: import('typescript').TypeChecker | undefined;
        if (this.context.getTypeChecker) {
            typeChecker = await this.context.getTypeChecker(filePath);
        }

        let template: any | undefined;
        if (needsTemplate) {
            template = await this.context.getTemplate(filePath);
        }

        return {
            filePath,
            fileContent,
            locator,
            program,
            typeChecker,
            template,
            options,
        };
    }
}
