import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadBaseline } from '../../src/serialization/read.js';
import { saveBaseline } from '../../src/serialization/write.js';

describe('baseline file io', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ngcompass-baseline-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports a missing file as BaselineNotFound', async () => {
    const result = await loadBaseline('.ngcompass/baseline.json', root);

    expect(!result.ok && result.error.kind).toBe('BaselineNotFound');
  });

  it('creates missing directories when saving', async () => {
    const saved = await saveBaseline(
      { version: 1, entries: { 'src/a.ts': { 'rule-a': 2 } } },
      '.ngcompass/baseline.json',
      root
    );

    expect(saved.ok).toBe(true);

    const loaded = await loadBaseline('.ngcompass/baseline.json', root);
    expect(loaded.ok && loaded.data.entries).toEqual({
      'src/a.ts': { 'rule-a': 2 },
    });
  });

  it('surfaces corruption as a typed error rather than a throw', async () => {
    await writeFile(path.join(root, 'baseline.json'), 'not json', 'utf8');

    const result = await loadBaseline('baseline.json', root);

    expect(!result.ok && result.error.kind).toBe('BaselineMalformed');
  });
});
