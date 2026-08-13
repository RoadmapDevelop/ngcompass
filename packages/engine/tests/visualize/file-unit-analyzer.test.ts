import { analyzeTemplate, parseHtml, parseTs } from '@ngcompass/ast';
import { Locator } from '@ngcompass/common';
import { analyzeFileUnitGraph } from '../../src/visualize/file-unit-analyzer.js';
import type { FileUnitGraph, UnitEdge, UnitLane } from '../../src/visualize/unit-graph.js';

interface UnitSources {
  readonly ts: string;
  readonly html?: string;
  readonly spec?: string;
  readonly styles?: string;
}

function analyzeUnit(sources: UnitSources): FileUnitGraph {
  const { program } = parseTs(sources.ts, 'sample.component.ts');

  return analyzeFileUnitGraph({
    entryFile: 'sample.component.ts',
    entryLabel: 'sample.component.ts',
    program,
    locator: new Locator(sources.ts),
    template:
      sources.html === undefined
        ? null
        : {
            status: 'parsed',
            filePath: 'sample.component.html',
            label: 'sample.component.html',
            analysis: analyzeTemplate(parseHtml(sources.html)),
            locator: new Locator(sources.html),
          },
    styles:
      sources.styles === undefined
        ? []
        : [
            {
              status: 'parsed',
              filePath: 'sample.component.scss',
              label: 'sample.component.scss',
              content: sources.styles,
            },
          ],
    spec:
      sources.spec === undefined
        ? null
        : {
            status: 'parsed',
            filePath: 'sample.component.spec.ts',
            label: 'sample.component.spec.ts',
            program: parseTs(sources.spec, 'sample.component.spec.ts').program,
            locator: new Locator(sources.spec),
          },
  });
}

function laneById(graph: FileUnitGraph, id: string): UnitLane {
  const lane = graph.lanes.find((candidate) => candidate.id === id);
  if (!lane) throw new Error(`lane ${id} not found`);
  return lane;
}

function edgesOfKind(graph: FileUnitGraph, kind: string): UnitEdge[] {
  return graph.edges.filter((edge) => edge.kind === kind);
}

function boxNames(lane: UnitLane): string[] {
  return lane.boxes.map((box) => box.name);
}

const COMPONENT_WITH_HANDLER = `
  @Component({})
  export class SampleComponent {
    title = 'hello';
    onSave() { return 1; }
  }
`;

describe('analyzeFileUnitGraph', () => {
  it('points an event binding from the template to the component method', () => {
    const graph = analyzeUnit({
      ts: COMPONENT_WITH_HANDLER,
      html: `<button (click)="onSave()">go</button>`,
    });

    const events = edgesOfKind(graph, 'template-event');
    expect(events).toHaveLength(1);
    expect(events[0].direction).toBe('control-up');
    expect(events[0].from).toContain('template#onSave');
    expect(events[0].to).toContain('ts#onSave');
  });

  it('points an interpolated field from the component to the template', () => {
    const graph = analyzeUnit({
      ts: COMPONENT_WITH_HANDLER,
      html: `<h1>{{ title }}</h1>`,
    });

    const bindings = edgesOfKind(graph, 'template-binding');
    expect(bindings).toHaveLength(1);
    expect(bindings[0].direction).toBe('data-down');
    expect(bindings[0].from).toContain('ts#title');
    expect(bindings[0].to).toContain('template#title');
  });

  it('emits a single both-direction edge for a two-way binding', () => {
    const graph = analyzeUnit({
      ts: COMPONENT_WITH_HANDLER,
      html: `<input [(ngModel)]="title" />`,
    });

    const bindings = edgesOfKind(graph, 'template-binding');
    expect(bindings).toHaveLength(1);
    expect(bindings[0].direction).toBe('both');
  });

  it('merges repeated bindings of one member into a single weighted box', () => {
    const graph = analyzeUnit({
      ts: COMPONENT_WITH_HANDLER,
      html: `<h1>{{ title }}</h1><h2>{{ title }}</h2><h3>{{ title }}</h3>`,
    });

    expect(boxNames(laneById(graph, 'template'))).toEqual(['title']);
    expect(edgesOfKind(graph, 'template-binding')[0].weight).toBe(3);
  });

  it('links a test to the member it exercises through a typed fixture variable', () => {
    const graph = analyzeUnit({
      ts: COMPONENT_WITH_HANDLER,
      spec: `
        describe('SampleComponent', () => {
          let component: SampleComponent;
          it('saves the record', () => {
            component.onSave();
          });
        });
      `,
    });

    const usages = edgesOfKind(graph, 'spec-usage');
    expect(usages).toHaveLength(1);
    expect(usages[0].to).toContain('ts#onSave');
    expect(boxNames(laneById(graph, 'spec'))).toEqual(['saves the record']);
  });

  it('ignores a spec member access on a variable of an unrelated type', () => {
    const graph = analyzeUnit({
      ts: COMPONENT_WITH_HANDLER,
      spec: `
        describe('SampleComponent', () => {
          let service: OtherService;
          it('saves the record', () => {
            service.onSave();
          });
        });
      `,
    });

    expect(edgesOfKind(graph, 'spec-usage')).toHaveLength(0);
  });

  it('links a component member to the dependency member it calls', () => {
    const graph = analyzeUnit({
      ts: `
        @Component({})
        export class SampleComponent {
          constructor(private users: UserService) {}
          load() { return this.users.fetchAll(); }
        }
      `,
    });

    const usages = edgesOfKind(graph, 'dependency-usage');
    expect(usages).toHaveLength(1);
    expect(usages[0].from).toContain('ts#load');
    expect(boxNames(laneById(graph, 'dependency:UserService'))).toEqual([
      'fetchAll',
    ]);
  });

  it('recognises a dependency injected through the inject() helper', () => {
    const graph = analyzeUnit({
      ts: `
        @Component({})
        export class SampleComponent {
          private users = inject(UserService);
          load() { return this.users.fetchAll(); }
        }
      `,
    });

    expect(edgesOfKind(graph, 'dependency-usage')).toHaveLength(1);
  });

  it('renders a lane for a dependency that is injected but never used', () => {
    const graph = analyzeUnit({
      ts: `
        @Component({})
        export class SampleComponent {
          constructor(private users: UserService) {}
        }
      `,
    });

    expect(laneById(graph, 'dependency:UserService').boxes).toEqual([]);
  });

  it('folds nested closures into the enclosing member instead of new boxes', () => {
    const graph = analyzeUnit({
      ts: `
        @Component({})
        export class SampleComponent {
          helper() { return 1; }
          load() {
            [1, 2].map(() => this.helper());
          }
        }
      `,
    });

    expect(boxNames(laneById(graph, 'ts'))).toEqual(['helper', 'load']);
  });

  it('lists stylesheet selectors as boxes carrying no edges', () => {
    const graph = analyzeUnit({
      ts: COMPONENT_WITH_HANDLER,
      styles: `.host { color: red; }\n.row, .cell { margin: 0; }`,
    });

    expect(boxNames(laneById(graph, 'styles:0'))).toEqual([
      '.host',
      '.row',
      '.cell',
    ]);
    expect(graph.edges).toHaveLength(0);
  });

  it('reports the entry class name it anchored the unit on', () => {
    const graph = analyzeUnit({ ts: COMPONENT_WITH_HANDLER });
    expect(graph.className).toBe('SampleComponent');
  });
});
