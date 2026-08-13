import type { Program } from 'oxc-parser';
import type ts from 'typescript';
import type { TypeChecker } from 'typescript';
import type {
  AngularTypeIndex,
  ProjectContext,
  StyleAst,
  TemplateAst,
} from '@ngcompass/common';

export interface AnalysisContext {
  readonly rootDir: string;
  readonly readFile: (filePath: string) => Promise<string>;
  readonly getProgram: (filePath: string) => Promise<Program>;
  readonly getTemplate: (filePath: string) => Promise<TemplateAst | undefined>;
  readonly getStyle: (filePath: string) => Promise<StyleAst | undefined>;

  readonly evict: (filePath: string) => void;

  readonly dispose: () => void;
}

export interface TypeAwareAnalysisContext extends AnalysisContext {
  readonly getTypeChecker: (
    filePath: string
  ) => Promise<ts.TypeChecker | undefined>;

  readonly getProjectContext: () => ProjectContext | undefined;

  readonly getTsProgram: () => ts.Program | undefined;

  readonly getTsSourceFile: (filePath: string) => ts.SourceFile | undefined;

  readonly getAngularTypes: () => AngularTypeIndex | undefined;

  readonly warmup: () => Promise<void>;

  readonly dispose: () => void;
}

export interface TypeAwareAnalysisContextOptions {
  readonly buildProjectContext?: boolean;

  readonly programRootFiles?: ReadonlyArray<string>;
}

export interface ExecutionContext {
  readonly rootDir: string;
  readonly readFile: (filePath: string) => Promise<string>;
  readonly getProgram: (filePath: string) => Promise<Program>;
  readonly getTypeChecker?: (
    filePath: string
  ) => Promise<TypeChecker | undefined>;
  readonly getTemplate: (filePath: string) => Promise<TemplateAst | undefined>;
  readonly getStyle: (filePath: string) => Promise<StyleAst | undefined>;

  readonly getProjectContext?: () => ProjectContext | undefined;

  readonly getTsSourceFile?: (filePath: string) => ts.SourceFile | undefined;

  readonly getAngularTypes?: () => AngularTypeIndex | undefined;
}
