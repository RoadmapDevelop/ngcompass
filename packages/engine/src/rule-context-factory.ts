import {
  AngularTypeIndex,
  Locator,
  RuleContext,
  TemplateAst,
  StyleAst,
  ProjectContext,
  ComponentCrossRef,
} from '@ngcompass/common';
import { Program } from 'oxc-parser';
import ts, { TypeChecker } from 'typescript';

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

export class RuleContextFactory {
  constructor(private readonly context: ExecutionContext) {}

  async build(
    filePath: string,
    options: Record<string, unknown>,
    needsTemplate: boolean
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

    let template: TemplateAst | undefined;
    let templateFilePath: string | undefined;
    let templateFileContent: string | undefined;
    let templateLocator: Locator | undefined;
    if (needsTemplate) {
      template = await this.context.getTemplate(filePath);
    }

    const project: ProjectContext | undefined =
      this.context.getProjectContext?.();
    const angularTypes: AngularTypeIndex | undefined =
      this.context.getAngularTypes?.();
    const sourceFile = this.context.getTsSourceFile?.(filePath);

    if (needsTemplate && !template && project) {
      templateFilePath = this.resolveExternalTemplatePath(filePath, project);
      if (templateFilePath) {
        template = await this.context.getTemplate(templateFilePath);
        templateFileContent = await this.context.readFile(templateFilePath);
        templateLocator = new Locator(templateFileContent);
      }
    }

    const crossRef = project
      ? await this.buildCrossRef(filePath, template, project)
      : undefined;

    return {
      filePath,
      fileContent,
      sourceFile,
      locator,
      program,
      typeChecker,
      template,
      templateFilePath,
      templateFileContent,
      templateLocator,
      options,
      project,
      crossRef,
      angularTypes,
    };
  }

  private resolveExternalTemplatePath(
    filePath: string,
    project: ProjectContext
  ): string | undefined {
    const componentPath = filePath.endsWith('.component.ts')
      ? filePath
      : project.templateToComponent.get(filePath);

    if (!componentPath) return undefined;
    return project.componentGraph.get(componentPath)?.templatePath;
  }

  private async buildCrossRef(
    filePath: string,
    loadedTemplate: TemplateAst | undefined,
    project: ProjectContext
  ): Promise<ComponentCrossRef | undefined> {
    const isComponent = filePath.endsWith('.component.ts');

    const componentPath = isComponent
      ? filePath
      : project.templateToComponent.get(filePath);

    if (!componentPath) return undefined;

    const cluster = project.componentGraph.get(componentPath);

    const templatePath = cluster?.templatePath;
    const stylePaths = cluster?.stylePaths ?? [];
    const specPath = cluster?.specPath;

    let publicMembers: ReadonlySet<string> | undefined;
    let signalMembers: ReadonlySet<string> | undefined;
    try {
      const tsSourceFile = await this.getComponentSourceFile(componentPath);
      if (tsSourceFile) {
        publicMembers = extractPublicMembers(tsSourceFile);
        signalMembers = extractSignalMembers(tsSourceFile);
      }
    } catch {}

    let effectiveTemplate = loadedTemplate;
    if (!effectiveTemplate && templatePath) {
      try {
        effectiveTemplate = await this.context.getTemplate(templatePath);
      } catch {}
    }

    let templateReferences: ReadonlySet<string> | undefined;
    if (effectiveTemplate) {
      try {
        templateReferences = extractTemplateReferences(effectiveTemplate);
      } catch {}
    }

    return {
      componentPath,
      templatePath,
      stylePaths,
      specPath,
      publicMembers,
      signalMembers,
      templateReferences,
    };
  }

  private async getComponentSourceFile(
    componentPath: string
  ): Promise<ts.SourceFile | undefined> {
    const existing = this.context.getTsSourceFile?.(componentPath);
    if (existing) return existing;

    const source = await this.context.readFile(componentPath);
    return ts.createSourceFile(
      componentPath,
      source,
      ts.ScriptTarget.Latest,
      true
    );
  }
}

function extractPublicMembers(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const members = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;

    for (const member of statement.members) {
      const mods = ts.canHaveModifiers(member)
        ? ts.getModifiers(member)
        : undefined;
      if (mods) {
        const isPrivateOrProtected = mods.some(
          (m) =>
            m.kind === ts.SyntaxKind.PrivateKeyword ||
            m.kind === ts.SyntaxKind.ProtectedKeyword
        );
        if (isPrivateOrProtected) continue;
      }

      const name = member.name;
      if (!name) continue;

      if (ts.isPrivateIdentifier(name)) continue;

      if (ts.isIdentifier(name)) {
        members.add(name.text);
      } else if (ts.isStringLiteral(name)) {
        members.add(name.text);
      }
    }
  }

  return members;
}

const SIGNAL_FACTORY_NAMES = new Set([
  'signal',
  'computed',
  'linkedSignal',
  'input',
  'model',
  'toSignal',
  'viewChild',
  'viewChildren',
  'contentChild',
  'contentChildren',
]);

const REQUIRED_VARIANT_BASES = new Set([
  'input',
  'viewChild',
  'contentChild',
]);

function getSignalFactoryName(expr: ts.Expression): string | undefined {
  const unwrapped =
    ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)
      ? expr.expression
      : expr;

  if (!ts.isCallExpression(unwrapped)) return undefined;

  const callee = unwrapped.expression;
  if (ts.isIdentifier(callee)) return callee.text;

  if (ts.isPropertyAccessExpression(callee)) {
    if (
      ts.isIdentifier(callee.expression) &&
      REQUIRED_VARIANT_BASES.has(callee.expression.text)
    ) {
      return callee.expression.text;
    }
    return callee.name.text;
  }

  return undefined;
}

function extractSignalMembers(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const members = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;

    for (const member of statement.members) {
      if (!ts.isPropertyDeclaration(member) || !member.initializer) continue;
      if (!member.name || ts.isPrivateIdentifier(member.name)) continue;

      const factoryName = getSignalFactoryName(member.initializer);
      if (!factoryName || !SIGNAL_FACTORY_NAMES.has(factoryName)) continue;

      if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
        members.add(member.name.text);
      }
    }
  }

  return members;
}

const TEMPLATE_IDENT_RE = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;

function extractIdentifiersFromExprString(
  expr: string,
  refs: Set<string>
): void {
  TEMPLATE_IDENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_IDENT_RE.exec(expr)) !== null) {
    refs.add(match[1]);
  }
}

function extractTemplateReferences(
  templateAst: TemplateAst
): ReadonlySet<string> {
  const refs = new Set<string>();

  const INTERPOLATION_RE = /\{\{([\s\S]*?)\}\}/g;

  function walkNode(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;

    if (Array.isArray(n['attrs'])) {
      for (const attr of n['attrs'] as unknown[]) {
        const a = attr as Record<string, unknown>;
        const attrName = typeof a['name'] === 'string' ? a['name'] : '';
        if (attrName.startsWith('(')) continue;
        const value = a['value'];
        if (typeof value === 'string' && value) {
          extractIdentifiersFromExprString(value, refs);
        }
      }
    }

    if (typeof n['value'] === 'string' && n['value']) {
      INTERPOLATION_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = INTERPOLATION_RE.exec(n['value'])) !== null) {
        extractIdentifiersFromExprString(m[1], refs);
      }
    }

    if (Array.isArray(n['children'])) {
      for (const child of n['children'] as unknown[]) {
        walkNode(child);
      }
    }
  }

  for (const node of templateAst.rootNodes) {
    walkNode(node);
  }

  return refs;
}
