import type { Program } from 'oxc-parser';
import type { Locator } from '../utils/locator.js';
import type { AngularTypeIndex } from './angular-type-index.js';
import type { ComponentCrossRef, ProjectContext } from './project-context.js';
import type { StyleAst, TemplateAst } from './source-ast.js';

export interface RuleContext {
  readonly sourceFile?: import('typescript').SourceFile;
  readonly filePath: string;
  readonly fileContent: string;
  readonly locator: Locator;
  readonly program?: Program;
  readonly typeChecker?: import('typescript').TypeChecker;

  readonly template?: TemplateAst;

  readonly templateFilePath?: string;
  readonly templateFileContent?: string;
  readonly templateLocator?: Locator;

  readonly style?: StyleAst;
  readonly options?: Readonly<Record<string, unknown>>;

  readonly project?: ProjectContext;

  readonly crossRef?: ComponentCrossRef;

  readonly angularTypes?: AngularTypeIndex;
}
