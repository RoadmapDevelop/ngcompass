import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { computeFileUnit } from '../../src/visualize/compute-file-unit.js';
import type { FileUnitGraph, UnitLane } from '../../src/visualize/unit-graph.js';

const COMPONENT_TS = `
  import { Component } from '@angular/core';
  import { UserService } from '../../src/visualize/user.service';

  @Component({
    selector: 'app-user',
    templateUrl: './user.component.html',
    styleUrls: ['./user.component.scss'],
  })
  export class UserComponent {
    title = 'users';
    constructor(private users: UserService) {}
    load() { return this.users.fetchAll(); }
  }
`;

const COMPONENT_HTML = `<h1>{{ title }}</h1><button (click)="load()">go</button>`;
const COMPONENT_SCSS = `.host { color: red; }`;
const COMPONENT_SPEC = `
  describe('UserComponent', () => {
    let component: UserComponent;
    it('loads users', () => {
      component.load();
    });
  });
`;

let workspace: string;

async function writeUnit(files: Readonly<Record<string, string>>): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(workspace, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

async function computeOk(entry: string): Promise<FileUnitGraph> {
  const result = await computeFileUnit(path.join(workspace, entry));
  if (!result.ok) throw new Error(`expected success, got ${result.error.kind}`);
  return result.data;
}

function laneById(graph: FileUnitGraph, id: string): UnitLane | undefined {
  return graph.lanes.find((lane) => lane.id === id);
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'ngcompass-visualize-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('computeFileUnit', () => {
  it('builds every lane of a fully colocated component unit', async () => {
    await writeUnit({
      'user.component.ts': COMPONENT_TS,
      'user.component.html': COMPONENT_HTML,
      'user.component.scss': COMPONENT_SCSS,
      'user.component.spec.ts': COMPONENT_SPEC,
    });

    const graph = await computeOk('user.component.ts');
    const laneIds = graph.lanes.map((lane) => lane.id);

    expect(laneIds).toEqual([
      'ts',
      'template',
      'styles:0',
      'spec',
      'dependency:UserService',
    ]);
  });

  it('anchors on the typescript file when given the template file', async () => {
    await writeUnit({
      'user.component.ts': COMPONENT_TS,
      'user.component.html': COMPONENT_HTML,
    });

    const graph = await computeOk('user.component.html');
    expect(path.basename(graph.entryFile)).toBe('user.component.ts');
  });

  it('anchors on the typescript file when given the spec file', async () => {
    await writeUnit({
      'user.component.ts': COMPONENT_TS,
      'user.component.spec.ts': COMPONENT_SPEC,
    });

    const graph = await computeOk('user.component.spec.ts');
    expect(path.basename(graph.entryFile)).toBe('user.component.ts');
  });

  it('flags a declared template that is missing from disk', async () => {
    await writeUnit({ 'user.component.ts': COMPONENT_TS });

    const graph = await computeOk('user.component.ts');
    expect(laneById(graph, 'template')?.status).toBe('declared-missing');
  });

  it('omits the spec lane when no spec file exists', async () => {
    await writeUnit({ 'user.component.ts': COMPONENT_TS });

    const graph = await computeOk('user.component.ts');
    expect(laneById(graph, 'spec')).toBeUndefined();
  });

  it('marks an inline template as inline rather than a file', async () => {
    await writeUnit({
      'inline.component.ts': `
        @Component({ template: \`<h1>{{ title }}</h1>\` })
        export class InlineComponent { title = 'x'; }
      `,
    });

    const graph = await computeOk('inline.component.ts');
    const lane = laneById(graph, 'template');
    expect(lane?.status).toBe('inline');
    expect(lane?.boxes.map((box) => box.name)).toEqual(['title']);
  });

  it('finds siblings by convention when the decorator declares nothing', async () => {
    await writeUnit({
      'plain.component.ts': `
        @Component({})
        export class PlainComponent { title = 'x'; }
      `,
      'plain.component.html': `<h1>{{ title }}</h1>`,
      'plain.component.scss': COMPONENT_SCSS,
    });

    const graph = await computeOk('plain.component.ts');
    expect(laneById(graph, 'template')?.status).toBe('parsed');
    expect(laneById(graph, 'styles:0')?.status).toBe('parsed');
  });

  it('connects template, spec and dependency lanes end to end', async () => {
    await writeUnit({
      'user.component.ts': COMPONENT_TS,
      'user.component.html': COMPONENT_HTML,
      'user.component.scss': COMPONENT_SCSS,
      'user.component.spec.ts': COMPONENT_SPEC,
    });

    const graph = await computeOk('user.component.ts');
    const kinds = graph.edges.map((edge) => edge.kind).sort();

    expect(kinds).toEqual([
      'dependency-usage',
      'spec-usage',
      'template-binding',
      'template-event',
    ]);
  });

  it('reports an unreadable entry file as an error result', async () => {
    const result = await computeFileUnit(path.join(workspace, 'nope.ts'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('EntryUnreadable');
  });

  it('degrades to an empty unit for a plain typescript file', async () => {
    await writeUnit({
      'math.ts': `export function add(a: number, b: number) { return a + b; }`,
    });

    const graph = await computeOk('math.ts');
    expect(graph.lanes.map((lane) => lane.id)).toEqual(['ts']);
    expect(laneById(graph, 'ts')?.boxes.map((box) => box.name)).toEqual(['add']);
  });
});
