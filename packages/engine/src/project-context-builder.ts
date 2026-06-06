import ts from 'typescript';
import * as path from 'node:path';
import { debug } from '@ngcompass/common';
import type {
  ProjectContext,
  ComponentFiles,
  NgModuleInfo,
} from '@ngcompass/common';

export function buildProjectContext(
  program: ts.Program,
  files: ReadonlyArray<string>,
  rootDir: string,
  componentFiles?: ReadonlyMap<string, ComponentFiles>
): ProjectContext {
  const start = performance.now();

  const projectFileSet = buildProjectFileSet(files, rootDir, program);

  const { importGraph, reverseImportGraph, externalDeps } = buildImportGraphs(
    program,
    projectFileSet
  );

  const barrelFiles = detectBarrelFiles(program, projectFileSet);

  const componentGraph =
    componentFiles ?? buildComponentGraph(projectFileSet, program);
  const templateToComponent = buildTemplateToComponentMap(componentGraph);

  const { ngModuleMap, standaloneComponents, classToFile } = buildNgModuleMap(
    program,
    projectFileSet
  );

  const edgeCount = countEdges(importGraph);
  debug(
    'engine',
    `ProjectContext built in ${(performance.now() - start).toFixed(2)}ms` +
      ` — ${projectFileSet.size} files, ${edgeCount} import edges,` +
      ` ${barrelFiles.size} barrels, ${externalDeps.size} files with ext deps,` +
      ` ${componentGraph.size} components, ${templateToComponent.size} template↔component links,` +
      ` ${ngModuleMap.size} NgModules/standalone, ${standaloneComponents.size} standalone`
  );

  return {
    importGraph: importGraph as ReadonlyMap<string, ReadonlySet<string>>,
    reverseImportGraph: reverseImportGraph as ReadonlyMap<
      string,
      ReadonlySet<string>
    >,
    ngModuleMap: ngModuleMap as ReadonlyMap<string, NgModuleInfo>,
    standaloneComponents: standaloneComponents as ReadonlySet<string>,
    classToFile: classToFile as ReadonlyMap<string, string>,
    componentGraph,
    projectFiles: projectFileSet,
    rootDir,
    barrelFiles: barrelFiles as ReadonlySet<string>,
    externalDeps: externalDeps as ReadonlyMap<string, ReadonlySet<string>>,
    templateToComponent: templateToComponent as ReadonlyMap<string, string>,
  };
}

function normalizeTsPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function buildProjectFileSet(
  files: ReadonlyArray<string>,
  rootDir: string,
  program: ts.Program
): Set<string> {
  const set = new Set<string>();

  for (const f of files) {
    set.add(normalizeTsPath(path.resolve(rootDir, f)));
  }

  const normRoot = normalizeTsPath(normaliseDir(rootDir));
  for (const sf of program.getSourceFiles()) {
    if (!sf.isDeclarationFile && sf.fileName.startsWith(normRoot)) {
      set.add(sf.fileName);
    }
  }

  return set;
}

export interface ImportGraphResult {
  readonly importGraph: ReadonlyMap<string, ReadonlySet<string>>;
  readonly projectFiles: ReadonlySet<string>;
  readonly rootDir: string;
}

export function buildImportGraphOnly(
  program: ts.Program,
  files: ReadonlyArray<string>,
  rootDir: string
): ImportGraphResult {
  const start = performance.now();
  const projectFileSet = buildProjectFileSet(files, rootDir, program);
  const { importGraph } = buildImportGraphs(program, projectFileSet);
  debug(
    'engine',
    `Import-graph-only built in ${(performance.now() - start).toFixed(2)}ms` +
      ` — ${projectFileSet.size} files, ${countEdges(importGraph)} edges`
  );
  return { importGraph, projectFiles: projectFileSet, rootDir };
}

function buildImportGraphs(
  program: ts.Program,
  projectFileSet: Set<string>
): {
  importGraph: Map<string, Set<string>>;
  reverseImportGraph: Map<string, Set<string>>;
  externalDeps: Map<string, Set<string>>;
} {
  const compilerOptions = program.getCompilerOptions();
  const moduleResolutionCache = ts.createModuleResolutionCache(
    program.getCurrentDirectory(),
    ts.sys.useCaseSensitiveFileNames
      ? (fileName) => fileName
      : (fileName) => fileName.toLowerCase(),
    compilerOptions
  );
  const importGraph = new Map<string, Set<string>>();
  const reverseImportGraph = new Map<string, Set<string>>();
  const externalDeps = new Map<string, Set<string>>();

  for (const file of projectFileSet) {
    importGraph.set(file, new Set());
    reverseImportGraph.set(file, new Set());
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!projectFileSet.has(sourceFile.fileName)) continue;

    const fromFile = sourceFile.fileName;

    const moduleSpecifiers = collectModuleSpecifiers(sourceFile);

    for (const specifier of moduleSpecifiers) {
      const resolved = ts.resolveModuleName(
        specifier,
        fromFile,
        compilerOptions,
        ts.sys,
        moduleResolutionCache
      );

      const toFile = resolved.resolvedModule?.resolvedFileName;

      if (toFile && projectFileSet.has(toFile)) {
        importGraph.get(fromFile)!.add(toFile);

        let reverseSet = reverseImportGraph.get(toFile);
        if (!reverseSet) {
          reverseSet = new Set();
          reverseImportGraph.set(toFile, reverseSet);
        }
        reverseSet.add(fromFile);
      } else {
        const pkgName = extractPackageName(specifier);
        if (pkgName) {
          let extSet = externalDeps.get(fromFile);
          if (!extSet) {
            extSet = new Set();
            externalDeps.set(fromFile, extSet);
          }
          extSet.add(pkgName);
        }
      }
    }
  }

  return { importGraph, reverseImportGraph, externalDeps };
}

function detectBarrelFiles(
  program: ts.Program,
  projectFileSet: Set<string>
): Set<string> {
  const barrelFiles = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!projectFileSet.has(sourceFile.fileName)) continue;

    const { statements } = sourceFile;

    if (statements.length === 0) continue;

    const isBarrel = statements.every(
      (stmt) => ts.isExportDeclaration(stmt) && stmt.moduleSpecifier != null
    );

    if (isBarrel) {
      barrelFiles.add(sourceFile.fileName);
    }
  }

  return barrelFiles;
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
      return;
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
      return;
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return specifiers;
}

function extractPackageName(specifier: string): string | null {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) return null;

  if (specifier.startsWith('@')) {
    const scopeSlash = specifier.indexOf('/', 1);
    if (scopeSlash === -1) return null;

    const nameSlash = specifier.indexOf('/', scopeSlash + 1);
    return nameSlash === -1 ? specifier : specifier.slice(0, nameSlash);
  }

  const slash = specifier.indexOf('/');
  return slash === -1 ? specifier : specifier.slice(0, slash);
}

function countEdges(graph: Map<string, Set<string>>): number {
  let n = 0;
  for (const s of graph.values()) n += s.size;
  return n;
}

function normaliseDir(dir: string): string {
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

function buildComponentGraph(
  projectFileSet: Set<string>,
  program: ts.Program
): Map<string, ComponentFiles> {
  const graph = new Map<string, ComponentFiles>();
  const styleExts = ['.scss', '.sass', '.css', '.less'];

  for (const file of projectFileSet) {
    if (!file.endsWith('.component.ts')) continue;

    const dir = path.dirname(file);

    const base = path.basename(file, '.ts');

    const htmlPath = normalizeTsPath(path.join(dir, base + '.html'));
    let templatePath: string | undefined = projectFileSet.has(htmlPath)
      ? htmlPath
      : undefined;

    const stylePaths: string[] = [];
    for (const ext of styleExts) {
      const stylePath = normalizeTsPath(path.join(dir, base + ext));
      if (projectFileSet.has(stylePath)) stylePaths.push(stylePath);
    }

    if (!templatePath || stylePaths.length === 0) {
      const decoratorPaths = extractDecoratorAssetPaths(
        program,
        file,
        dir,
        projectFileSet
      );
      if (!templatePath && decoratorPaths.templatePath) {
        templatePath = decoratorPaths.templatePath;
      }
      if (stylePaths.length === 0 && decoratorPaths.stylePaths.length > 0) {
        stylePaths.push(...decoratorPaths.stylePaths);
      }
    }

    const specCandidate = normalizeTsPath(path.join(dir, base + '.spec.ts'));
    const specPath = projectFileSet.has(specCandidate)
      ? specCandidate
      : undefined;

    graph.set(file, { tsPath: file, templatePath, stylePaths, specPath });
  }

  return graph;
}

function extractDecoratorAssetPaths(
  program: ts.Program,
  componentFile: string,
  dir: string,
  projectFileSet: Set<string>
): { templatePath: string | undefined; stylePaths: string[] } {
  const sourceFile = program.getSourceFile(componentFile);
  if (!sourceFile) return { templatePath: undefined, stylePaths: [] };

  const componentArg = findComponentDecoratorArg(sourceFile);
  if (!componentArg) return { templatePath: undefined, stylePaths: [] };

  let templatePath: string | undefined;
  const stylePaths: string[] = [];

  for (const prop of componentArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

    const name = prop.name.text;
    if (name === 'templateUrl') {
      const literal = getStringLiteralValue(prop.initializer);
      if (literal) {
        const resolved = normalizeTsPath(path.resolve(dir, literal));
        if (projectFileSet.has(resolved)) templatePath = resolved;
      }
      continue;
    }

    if (name === 'styleUrl') {
      const literal = getStringLiteralValue(prop.initializer);
      if (literal) {
        const resolved = normalizeTsPath(path.resolve(dir, literal));
        if (projectFileSet.has(resolved)) stylePaths.push(resolved);
      }
      continue;
    }

    if (name === 'styleUrls' && ts.isArrayLiteralExpression(prop.initializer)) {
      for (const element of prop.initializer.elements) {
        const literal = getStringLiteralValue(element);
        if (!literal) continue;
        const resolved = normalizeTsPath(path.resolve(dir, literal));
        if (projectFileSet.has(resolved)) stylePaths.push(resolved);
      }
    }
  }

  return { templatePath, stylePaths };
}

function findComponentDecoratorArg(
  sourceFile: ts.SourceFile
): ts.ObjectLiteralExpression | undefined {
  for (const stmt of sourceFile.statements) {
    if (!ts.isClassDeclaration(stmt)) continue;
    const decorators = ts.canHaveDecorators(stmt)
      ? ts.getDecorators(stmt)
      : undefined;
    if (!decorators) continue;

    for (const decorator of decorators) {
      const expr = decorator.expression;
      if (!ts.isCallExpression(expr)) continue;
      if (
        !ts.isIdentifier(expr.expression) ||
        expr.expression.text !== 'Component'
      )
        continue;

      const arg = expr.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) return arg;
    }
  }
  return undefined;
}

function getStringLiteralValue(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

function buildTemplateToComponentMap(
  componentGraph: ReadonlyMap<string, ComponentFiles>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [tsPath, cluster] of componentGraph) {
    if (cluster.templatePath) {
      map.set(cluster.templatePath, tsPath);
    }
  }
  return map;
}

function buildNgModuleMap(
  program: ts.Program,
  projectFileSet: Set<string>
): {
  ngModuleMap: Map<string, NgModuleInfo>;
  standaloneComponents: Set<string>;
  classToFile: Map<string, string>;
} {
  const ngModuleMap = new Map<string, NgModuleInfo>();
  const standaloneComponents = new Set<string>();
  const classToFile = buildClassToFileMap(program, projectFileSet);

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!projectFileSet.has(sourceFile.fileName)) continue;

    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement)) continue;

      const decorators = ts.canHaveDecorators(statement)
        ? ts.getDecorators(statement)
        : undefined;
      if (!decorators?.length) continue;

      for (const decorator of decorators) {
        const info = getDecoratorCallInfo(decorator);
        if (!info) continue;

        const { name, arg } = info;

        if (name === 'NgModule') {
          if (arg) {
            ngModuleMap.set(sourceFile.fileName, {
              filePath: sourceFile.fileName,
              declarations: new Set(extractArrayElements(arg, 'declarations')),
              imports: new Set(extractArrayElements(arg, 'imports')),
              exports: new Set(extractArrayElements(arg, 'exports')),
              providers: new Set(extractArrayElements(arg, 'providers')),
              isStandalone: false,
            });
          }
          break;
        }

        if (name === 'Component') {
          const isStandalone = arg ? extractBoolProp(arg, 'standalone') : false;
          if (isStandalone) {
            standaloneComponents.add(sourceFile.fileName);
            ngModuleMap.set(sourceFile.fileName, {
              filePath: sourceFile.fileName,
              declarations: new Set<string>(),
              imports: new Set(arg ? extractArrayElements(arg, 'imports') : []),
              exports: new Set<string>(),
              providers: new Set(
                arg ? extractArrayElements(arg, 'providers') : []
              ),
              isStandalone: true,
            });
          }
          break;
        }

        if (name === 'Directive' || name === 'Pipe') {
          if (arg && extractBoolProp(arg, 'standalone')) {
            standaloneComponents.add(sourceFile.fileName);
          }
          break;
        }
      }
    }
  }

  return { ngModuleMap, standaloneComponents, classToFile };
}

function buildClassToFileMap(
  program: ts.Program,
  projectFileSet: Set<string>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!projectFileSet.has(sourceFile.fileName)) continue;

    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;

      const mods = ts.canHaveModifiers(statement)
        ? ts.getModifiers(statement)
        : undefined;
      const isExported = mods?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (!isExported) continue;

      map.set(statement.name.text, sourceFile.fileName);
    }
  }

  return map;
}

function getDecoratorCallInfo(
  decorator: ts.Decorator
): { name: string; arg: ts.ObjectLiteralExpression | undefined } | undefined {
  const expr = decorator.expression;
  if (!ts.isCallExpression(expr)) return undefined;

  const callee = expr.expression;
  if (!ts.isIdentifier(callee)) return undefined;

  const firstArg = expr.arguments[0];
  const arg =
    firstArg && ts.isObjectLiteralExpression(firstArg) ? firstArg : undefined;

  return { name: callee.text, arg };
}

function extractArrayElements(
  arg: ts.ObjectLiteralExpression,
  propName: string
): string[] {
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name) || prop.name.text !== propName) continue;

    const init = prop.initializer;
    if (!ts.isArrayLiteralExpression(init)) return [];

    const names: string[] = [];
    for (const el of init.elements) {
      names.push(...extractClassNameFromExpression(el));
    }
    return names;
  }
  return [];
}

function extractClassNameFromExpression(node: ts.Expression): string[] {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    return extractClassNameFromExpression(node.expression);
  }
  if (ts.isCallExpression(node)) {
    return extractClassNameFromExpression(node.expression);
  }
  return [];
}

function extractBoolProp(
  arg: ts.ObjectLiteralExpression,
  propName: string
): boolean {
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name) || prop.name.text !== propName) continue;
    return prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
  }
  return false;
}
