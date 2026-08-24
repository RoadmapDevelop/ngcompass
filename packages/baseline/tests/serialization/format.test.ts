import {
  parseBaseline,
  serializeBaseline,
} from '../../src/serialization/format.js';

describe('serializeBaseline', () => {
  it('sorts file and rule keys regardless of input order', () => {
    const output = serializeBaseline({
      version: 1,
      entries: {
        'src/z.ts': { 'rule-b': 1, 'rule-a': 2 },
        'src/a.ts': { 'rule-c': 3 },
      },
    });

    expect(output).toBe(
      `{
  "version": 1,
  "entries": {
    "src/a.ts": {
      "rule-c": 3
    },
    "src/z.ts": {
      "rule-a": 2,
      "rule-b": 1
    }
  }
}
`
    );
  });

  it('ends with a trailing newline', () => {
    const output = serializeBaseline({ version: 1, entries: {} });
    expect(output.endsWith('}\n')).toBe(true);
  });

  it('omits zero counts', () => {
    const output = serializeBaseline({
      version: 1,
      entries: { 'src/a.ts': { 'rule-a': 0, 'rule-b': 2 } },
    });

    expect(output).not.toContain('rule-a');
    expect(output).toContain('rule-b');
  });

  it('drops a file whose every count is zero', () => {
    const output = serializeBaseline({
      version: 1,
      entries: { 'src/a.ts': { 'rule-a': 0 } },
    });

    expect(JSON.parse(output).entries).toEqual({});
  });
});

describe('parseBaseline', () => {
  it('round-trips a serialized baseline', () => {
    const baseline = {
      version: 1,
      entries: { 'src/a.ts': { 'rule-a': 2 }, 'src/b.ts': { 'rule-b': 1 } },
    };
    const parsed = parseBaseline(serializeBaseline(baseline), 'baseline.json');

    expect(parsed.ok && parsed.data).toEqual(baseline);
  });

  it('rejects malformed JSON without throwing', () => {
    const parsed = parseBaseline('{ not json', 'baseline.json');

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.kind).toBe('BaselineMalformed');
  });

  it('rejects an unsupported version', () => {
    const parsed = parseBaseline(
      JSON.stringify({ version: 99, entries: {} }),
      'baseline.json'
    );

    expect(!parsed.ok && parsed.error.kind).toBe('BaselineVersionUnsupported');
  });

  it('rejects a negative count', () => {
    const parsed = parseBaseline(
      JSON.stringify({ version: 1, entries: { 'a.ts': { 'rule-a': -1 } } }),
      'baseline.json'
    );

    expect(!parsed.ok && parsed.error.kind).toBe('BaselineMalformed');
  });

  it('rejects a non-object entry', () => {
    const parsed = parseBaseline(
      JSON.stringify({ version: 1, entries: { 'a.ts': 3 } }),
      'baseline.json'
    );

    expect(!parsed.ok && parsed.error.kind).toBe('BaselineMalformed');
  });
});
