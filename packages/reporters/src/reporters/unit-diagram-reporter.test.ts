import type { FileUnitGraph } from '@ngcompass/common';
import {
  escapeForScript,
  escapeHtml,
  renderUnitDiagram,
} from './unit-diagram-reporter.js';

function graphWith(overrides: Partial<FileUnitGraph>): FileUnitGraph {
  return {
    entryFile: 'user.component.ts',
    className: 'UserComponent',
    lanes: [
      {
        id: 'ts',
        kind: 'ts',
        status: 'parsed',
        label: 'user.component.ts',
        filePath: 'user.component.ts',
        boxes: [
          { id: 'ts#onSave@4', name: 'onSave', kind: 'method', line: 4, column: 2 },
        ],
      },
      {
        id: 'template',
        kind: 'template',
        status: 'parsed',
        label: 'user.component.html',
        filePath: 'user.component.html',
        boxes: [
          {
            id: 'template#onSave@0',
            name: 'onSave',
            kind: 'binding',
            line: 1,
            column: 8,
          },
        ],
      },
    ],
    edges: [
      {
        from: 'template#onSave@0',
        to: 'ts#onSave@4',
        kind: 'template-event',
        direction: 'control-up',
        weight: 1,
      },
    ],
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('neutralises every character that could open a tag or attribute', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;'
    );
  });
});

describe('escapeForScript', () => {
  it('breaks a closing script tag embedded in payload data', () => {
    expect(escapeForScript('{"a":"</script>"}')).toBe('{"a":"<\\/script>"}');
  });

  it('escapes the separators that would terminate the script line', () => {
    expect(escapeForScript('a\u2028b\u2029c')).toBe('a\\u2028b\\u2029c');
  });
});


describe('renderUnitDiagram', () => {
  it('renders a box element for every box in the graph', () => {
    const html = renderUnitDiagram(graphWith({}));
    expect(html).toContain('data-box="ts#onSave@4"');
    expect(html).toContain('data-box="template#onSave@0"');
  });

  it('renders a lane section for every lane in the graph', () => {
    const html = renderUnitDiagram(graphWith({}));
    expect(html).toContain('data-lane="ts"');
    expect(html).toContain('data-lane="template"');
  });

  it('embeds the edges so the client can draw a wire for each', () => {
    const html = renderUnitDiagram(graphWith({}));
    expect(html).toContain('"from":"template#onSave@0"');
    expect(html).toContain('"to":"ts#onSave@4"');
  });

  it('escapes a selector name that would otherwise inject markup', () => {
    const html = renderUnitDiagram(
      graphWith({
        lanes: [
          {
            id: 'styles:0',
            kind: 'styles',
            status: 'parsed',
            label: 'a.scss',
            filePath: 'a.scss',
            boxes: [
              {
                id: 'styles:0#x@1',
                name: '<script>alert(1)</script>',
                kind: 'selector',
                line: 1,
                column: 1,
              },
            ],
          },
        ],
        edges: [],
      })
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('surfaces a declared-missing lane as a visible status note', () => {
    const html = renderUnitDiagram(
      graphWith({
        lanes: [
          {
            id: 'template',
            kind: 'template',
            status: 'declared-missing',
            label: 'gone.html',
            filePath: 'gone.html',
            boxes: [],
          },
        ],
        edges: [],
      })
    );

    expect(html).toContain('status-declared-missing');
    expect(html).toContain('declared but not found on disk');
  });
});
