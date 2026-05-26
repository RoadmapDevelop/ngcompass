import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAnalysisContext } from '../src/analysis-context.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const TEST_ROOT = path.join(tmpdir(), `ngcompass-engine-test-${Date.now()}`);

const FILES = {
  simpleTs: path.join(TEST_ROOT, 'simple.ts'),
  simpleCss: path.join(TEST_ROOT, 'simple.css'),
  simpleHtml: path.join(TEST_ROOT, 'simple.html'),
};

const SIMPLE_TS_CONTENT = 'export const x = 1;';
const SIMPLE_CSS_CONTENT = '.foo { color: red; }';
const SIMPLE_HTML_CONTENT = '<div>hello</div>';

beforeAll(async () => {
  await mkdir(TEST_ROOT, { recursive: true });
  await writeFile(FILES.simpleTs, SIMPLE_TS_CONTENT, 'utf-8');
  await writeFile(FILES.simpleCss, SIMPLE_CSS_CONTENT, 'utf-8');
  await writeFile(FILES.simpleHtml, SIMPLE_HTML_CONTENT, 'utf-8');
});

afterAll(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
});

describe('createAnalysisContext', () => {
  describe('rootDir', () => {
    it('exposes the provided rootDir on the returned context', () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      expect(ctx.rootDir).toBe(TEST_ROOT);
    });
  });

  describe('readFile', () => {
    it('returns file content for an existing file', async () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const content = await ctx.readFile(FILES.simpleTs);
      expect(content).toBe(SIMPLE_TS_CONTENT);
    });

    it('throws for a non-existent file', async () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      await expect(
        ctx.readFile(path.join(TEST_ROOT, 'missing.ts'))
      ).rejects.toThrow(/Cannot read file/);
    });

    it('returns the same Promise instance on consecutive calls (memoization)', () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const p1 = ctx.readFile(FILES.simpleTs);
      const p2 = ctx.readFile(FILES.simpleTs);

      expect(p1).toBe(p2);
    });
  });

  describe('getProgram', () => {
    it('returns a parsed Program for a TypeScript file', async () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const program = await ctx.getProgram(FILES.simpleTs);
      expect(program).toBeDefined();

      expect(program).toHaveProperty('body');
    });

    it('returns the same Promise instance on consecutive calls (memoization)', () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const p1 = ctx.getProgram(FILES.simpleTs);
      const p2 = ctx.getProgram(FILES.simpleTs);
      expect(p1).toBe(p2);
    });
  });

  describe('getStyle', () => {
    it('returns undefined for a .ts file (not a CSS file)', async () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const style = await ctx.getStyle(FILES.simpleTs);
      expect(style).toBeUndefined();
    });

    it('returns a StyleAst-like object for a .css file', async () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const style = await ctx.getStyle(FILES.simpleCss);

      expect(style).toBeDefined();
    });

    it('returns the same Promise instance on consecutive calls (memoization)', () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const p1 = ctx.getStyle(FILES.simpleCss);
      const p2 = ctx.getStyle(FILES.simpleCss);
      expect(p1).toBe(p2);
    });

    it('caches "undefined" result for .ts files across repeated calls', () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const p1 = ctx.getStyle(FILES.simpleTs);
      const p2 = ctx.getStyle(FILES.simpleTs);
      expect(p1).toBe(p2);
    });
  });

  describe('getTemplate', () => {
    it('returns a TemplateAst for a .html file', async () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const template = await ctx.getTemplate(FILES.simpleHtml);
      expect(template).toBeDefined();
      expect(template).toHaveProperty('rootNodes');
    });

    it('returns the same Promise instance on consecutive calls (memoization)', () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const p1 = ctx.getTemplate(FILES.simpleHtml);
      const p2 = ctx.getTemplate(FILES.simpleHtml);
      expect(p1).toBe(p2);
    });

    it('returns undefined for a .ts file with no inline template', async () => {
      const ctx = createAnalysisContext(TEST_ROOT);
      const template = await ctx.getTemplate(FILES.simpleTs);
      expect(template).toBeUndefined();
    });
  });
});
