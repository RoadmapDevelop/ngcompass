import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createAngularTypeIndex } from '../src/angular-type-index.js';

const ANGULAR_CORE_DTS = `
export declare interface Signal<T> { (): T; }
export declare interface WritableSignal<T> extends Signal<T> {
  set(value: T): void;
  update(updater: (current: T) => T): void;
}
export declare class InjectionToken<T> { constructor(description: string); }
export declare function Injectable(options?: unknown): ClassDecorator;
`;

const ANGULAR_HTTP_DTS = `
export declare class HttpClient {
  get<T>(url: string): unknown;
}
`;

const RXJS_DTS = `
export declare class Observable<T> { subscribe(): unknown; }
export declare class BehaviorSubject<T> extends Observable<T> { next(value: T): void; }
`;

const USER_SRC = `
import { Signal, WritableSignal, InjectionToken, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

declare const realSignal: Signal<number>;
declare const realWritable: WritableSignal<number>;
declare const realObs: Observable<string>;
declare const realSubject: BehaviorSubject<string>;
declare const realHttp: HttpClient;
declare const realToken: InjectionToken<string>;

// Look-alikes whose names match exactly but whose declarations live in
// user code. Hosted inside a namespace so they do not shadow the imports.
namespace LookAlikes {
  export interface Signal<T> { fake: true; }
  export class HttpClient { fakeHttp = true; }
}
declare const fakeSignal: LookAlikes.Signal<number>;
declare const fakeHttp: LookAlikes.HttpClient;

@Injectable()
class MyInjectable {}

class PlainClass {}
`;

interface Fixture {
  program: ts.Program;
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
  tmpDir: string;
}

function writeFixture(): Fixture {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngc-typeidx-'));

  const write = (relPath: string, content: string): void => {
    const full = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };

  write('node_modules/@angular/core/index.d.ts', ANGULAR_CORE_DTS);
  write(
    'node_modules/@angular/core/package.json',
    JSON.stringify({ name: '@angular/core', types: 'index.d.ts' })
  );
  write('node_modules/@angular/common/http.d.ts', ANGULAR_HTTP_DTS);
  write(
    'node_modules/@angular/common/package.json',
    JSON.stringify({
      name: '@angular/common',
      exports: { './http': { types: './http.d.ts' } },
    })
  );
  write('node_modules/rxjs/index.d.ts', RXJS_DTS);
  write(
    'node_modules/rxjs/package.json',
    JSON.stringify({ name: 'rxjs', types: 'index.d.ts' })
  );

  const userPath = path.join(tmpDir, 'src/user.ts');
  write('src/user.ts', USER_SRC);

  const program = ts.createProgram({
    rootNames: [userPath],
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

  const sourceFile = program.getSourceFile(userPath);
  if (!sourceFile) throw new Error('Failed to load user source file');

  return { program, sourceFile, checker: program.getTypeChecker(), tmpDir };
}

function findVariableType(fixture: Fixture, name: string): ts.Type {
  for (const stmt of fixture.sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name) {
        return fixture.checker.getTypeAtLocation(decl);
      }
    }
  }
  throw new Error(`No declaration named ${name}`);
}

function findClassSymbol(fixture: Fixture, name: string): ts.Symbol {
  for (const stmt of fixture.sourceFile.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    if (stmt.name.text !== name) continue;
    const symbol = fixture.checker.getSymbolAtLocation(stmt.name);
    if (!symbol) throw new Error(`No symbol for class ${name}`);
    return symbol;
  }
  throw new Error(`No class named ${name}`);
}

describe('createAngularTypeIndex', () => {
  let fx: Fixture;

  beforeAll(() => {
    fx = writeFixture();
  });

  afterAll(() => {
    fs.rmSync(fx.tmpDir, { recursive: true, force: true });
  });

  it('isSignal recognises real Signal from @angular/core', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isSignal(findVariableType(fx, 'realSignal'))).toBe(true);
    expect(idx.isSignal(findVariableType(fx, 'realWritable'))).toBe(true);
  });

  it('isSignal rejects user-declared types named Signal', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isSignal(findVariableType(fx, 'fakeSignal'))).toBe(false);
  });

  it('isWritableSignal narrows to WritableSignal only', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isWritableSignal(findVariableType(fx, 'realWritable'))).toBe(
      true
    );
    expect(idx.isWritableSignal(findVariableType(fx, 'realSignal'))).toBe(
      false
    );
  });

  it('isObservable recognises real Observable from rxjs', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isObservable(findVariableType(fx, 'realObs'))).toBe(true);
  });

  it('isSubjectLike recognises BehaviorSubject from rxjs', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isSubjectLike(findVariableType(fx, 'realSubject'))).toBe(true);
  });

  it('isHttpClient recognises HttpClient and rejects look-alikes', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isHttpClient(findVariableType(fx, 'realHttp'))).toBe(true);
    expect(idx.isHttpClient(findVariableType(fx, 'fakeHttp'))).toBe(false);
  });

  it('isInjectionToken recognises real InjectionToken', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isInjectionToken(findVariableType(fx, 'realToken'))).toBe(true);
  });

  it('isInjectableClass recognises @Injectable-decorated classes', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isInjectableClass(findClassSymbol(fx, 'MyInjectable'))).toBe(
      true
    );
    expect(idx.isInjectableClass(findClassSymbol(fx, 'PlainClass'))).toBe(
      false
    );
  });

  it('returns a null index when program is undefined', () => {
    const idx = createAngularTypeIndex(undefined);
    expect(idx.isSignal(undefined)).toBe(false);
    expect(idx.isFromAngularCore(undefined)).toBe(false);
    expect(idx.isInjectableClass(undefined)).toBe(false);
  });

  it('handles undefined inputs without throwing', () => {
    const idx = createAngularTypeIndex(fx.program);
    expect(idx.isSignal(undefined)).toBe(false);
    expect(idx.isObservable(undefined)).toBe(false);
    expect(idx.isHttpClient(undefined)).toBe(false);
    expect(idx.isFromPackage(undefined, '@angular/core')).toBe(false);
  });
});
