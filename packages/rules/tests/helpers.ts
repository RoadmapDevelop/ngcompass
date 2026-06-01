import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { Locator } from '@ngcompass/common';
import { parseTs } from '@ngcompass/ast';
import { createAngularTypeIndex } from '@ngcompass/engine';
import type { RuleContext } from '@ngcompass/common';
import type { Program } from 'oxc-parser';

export function makeContext(
  source: string,
  filePath = '/src/test.component.ts'
): RuleContext & { program: Program } {
  const { program } = parseTs(source, filePath);
  return {
    filePath,
    fileContent: source,

    sourceText: source,
    locator: new Locator(source),
    program,
  } as any;
}

export function findNodes(
  program: Program,
  predicate: (n: any) => boolean
): any[] {
  const results: any[] = [];
  const stack: any[] = [program];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (predicate(node)) results.push(node);
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) stack.push(...val);
      else if (val && typeof val === 'object') stack.push(val);
    }
  }
  return results;
}

export function findCallExpressions(program: Program, callee?: string): any[] {
  return findNodes(program, (n) => {
    if (n.type !== 'CallExpression') return false;
    if (!callee) return true;

    if (n.callee?.type === 'Identifier' && n.callee.name === callee)
      return true;

    if (
      (n.callee?.type === 'StaticMemberExpression' ||
        n.callee?.type === 'MemberExpression') &&
      n.callee?.property?.name === callee
    )
      return true;
    return false;
  });
}

const ANGULAR_DECORATOR_NAMES = new Set([
  'Component',
  'Directive',
  'Pipe',
  'Injectable',
  'NgModule',
]);

function extractDecoratorName(classNode: any, filePath: string): string {
  const decorators = classNode.decorators;
  if (Array.isArray(decorators)) {
    for (const d of decorators) {
      const expr = d.expression ?? d;
      if (expr?.type === 'Identifier' && ANGULAR_DECORATOR_NAMES.has(expr.name))
        return expr.name;
      if (expr?.type === 'CallExpression') {
        const callee = expr.callee;
        if (
          callee?.type === 'Identifier' &&
          ANGULAR_DECORATOR_NAMES.has(callee.name)
        )
          return callee.name;
      }
    }
  }

  if (filePath.endsWith('.component.ts')) return 'Component';
  if (filePath.endsWith('.directive.ts')) return 'Directive';
  if (filePath.endsWith('.pipe.ts')) return 'Pipe';
  if (filePath.endsWith('.service.ts')) return 'Injectable';
  if (filePath.endsWith('.module.ts')) return 'NgModule';
  if (filePath.endsWith('.guard.ts')) return 'Injectable';

  return 'Unknown';
}

export function makeAngularClassNode(
  source: string,
  filePath = '/src/test.component.ts',
  metadata: Record<string, unknown> = {}
): { classStreamNode: any; ctx: RuleContext & { program: Program } } {
  const ctx = makeContext(source, filePath);
  const classNodes = findNodes(
    ctx.program,
    (n: any) => n.type === 'ClassDeclaration'
  );
  if (!classNodes.length) {
    throw new Error(
      `makeAngularClassNode: no ClassDeclaration found in source:\n${source.slice(0, 200)}`
    );
  }

  const decoratorName =
    (metadata.decoratorName as string | undefined) ??
    extractDecoratorName(classNodes[0], filePath);
  const classStreamNode = { node: classNodes[0], metadata, decoratorName };
  return { classStreamNode, ctx };
}

const ANGULAR_CORE_STUB = `
export declare interface Signal<T> { (): T; }
export declare interface WritableSignal<T> extends Signal<T> {
  set(value: T): void;
  update(updater: (current: T) => T): void;
}
export declare function signal<T>(value: T): WritableSignal<T>;
export declare function computed<T>(fn: () => T): Signal<T>;
export declare function effect(fn: () => void): { destroy(): void };
export declare class InjectionToken<T> { constructor(description: string); }
export declare function Injectable(options?: unknown): ClassDecorator;
export declare function Inject(token: unknown): ParameterDecorator;
export declare function Optional(): ParameterDecorator;
export declare function Self(): ParameterDecorator;
export declare function SkipSelf(): ParameterDecorator;
export declare function Host(): ParameterDecorator;
export declare function Component(options?: unknown): ClassDecorator;
export declare function Directive(options?: unknown): ClassDecorator;
export declare function Output(name?: string): PropertyDecorator;
export declare function Input(name?: string): PropertyDecorator;
export declare class EventEmitter<T> {
  emit(value?: T): void;
  subscribe(next?: (value: T) => void): unknown;
}
export declare class Router {}
export declare class ChangeDetectorRef {
  detectChanges(): void;
  markForCheck(): void;
}
export declare class DestroyRef {}
export declare class NgZone {
  run<T>(fn: () => T): T;
  runOutsideAngular<T>(fn: () => T): T;
}
export declare enum ChangeDetectionStrategy { OnPush = 0, Default = 1 }
`;

const ANGULAR_HTTP_STUB = `
export declare class HttpClient {
  get<T>(url: string): unknown;
  post<T>(url: string, body: unknown): unknown;
}
`;

const RXJS_STUB = `
export declare class Observable<T> { subscribe(): unknown; }
export declare class Subject<T> extends Observable<T> {
  next(value: T): void;
  complete(): void;
  error(err: unknown): void;
}
export declare class BehaviorSubject<T> extends Subject<T> {}
`;

export interface TypeAwareFixture {
  readonly ctx: RuleContext & { program: Program };

  readonly oxcProgram: Program;

  readonly filePath: string;

  readonly dispose: () => void;
}

interface TypeAwareOptions {
  readonly crossRef?: RuleContext['crossRef'];
}

let tempDirCounter = 0;

export function makeTypeAwareContext(
  source: string,
  options: TypeAwareOptions = {}
): TypeAwareFixture {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `ngc-rule-${tempDirCounter++}-`)
  );

  const writeFile = (relPath: string, content: string): void => {
    const full = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };

  writeFile('node_modules/@angular/core/index.d.ts', ANGULAR_CORE_STUB);
  writeFile(
    'node_modules/@angular/core/package.json',
    JSON.stringify({ name: '@angular/core', types: 'index.d.ts' })
  );
  writeFile('node_modules/@angular/common/http.d.ts', ANGULAR_HTTP_STUB);
  writeFile(
    'node_modules/@angular/common/package.json',
    JSON.stringify({
      name: '@angular/common',
      exports: { './http': { types: './http.d.ts' } },
    })
  );
  writeFile('node_modules/rxjs/index.d.ts', RXJS_STUB);
  writeFile(
    'node_modules/rxjs/package.json',
    JSON.stringify({ name: 'rxjs', types: 'index.d.ts' })
  );

  const filePath = path.join(tmpDir, 'src/source.ts');
  writeFile('src/source.ts', source);

  const tsProgram = ts.createProgram({
    rootNames: [filePath],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      experimentalDecorators: true,
      strict: false,
      noEmit: true,
      baseUrl: tmpDir,
      paths: {
        '@angular/common/http': ['node_modules/@angular/common/http.d.ts'],
      },
    },
  });

  const sourceFile = tsProgram.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(
      'makeTypeAwareContext: failed to load user source into TS Program'
    );
  }

  const { program: oxcProgram } = parseTs(source, filePath);
  const typeChecker = tsProgram.getTypeChecker();
  const angularTypes = createAngularTypeIndex(tsProgram);

  const ctx: RuleContext & { program: Program } = {
    filePath,
    fileContent: source,
    locator: new Locator(source),
    program: oxcProgram,
    typeChecker,
    sourceFile,
    angularTypes,
    crossRef: options.crossRef,
  } as RuleContext & { program: Program };

  let disposed = false;
  return {
    ctx,
    oxcProgram,
    filePath,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

export function makeTypeAwareAngularClassFixture(
  source: string,
  options: TypeAwareOptions = {}
): TypeAwareFixture & {
  classStreamNode: {
    node: unknown;
    metadata: Record<string, unknown>;
    decoratorName: string;
  };
} {
  const base = makeTypeAwareContext(source, options);
  const classNodes = findNodes(
    base.oxcProgram,
    (n: any) => n.type === 'ClassDeclaration'
  );
  if (!classNodes.length) {
    base.dispose();
    throw new Error(
      'makeTypeAwareAngularClassFixture: no ClassDeclaration found in source'
    );
  }
  const decoratorName = extractDecoratorName(classNodes[0], base.filePath);
  const classStreamNode = { node: classNodes[0], metadata: {}, decoratorName };
  return Object.assign(base, { classStreamNode });
}
