import path from 'node:path';
import { baseNameOf, toBaselineKey } from '../src/paths.js';

describe('toBaselineKey', () => {
  it('produces a forward-slash path relative to the root', () => {
    const root = path.resolve('/repo');
    const file = path.join(root, 'src', 'app', 'user.component.ts');

    expect(toBaselineKey(file, root)).toBe('src/app/user.component.ts');
  });

  it('is stable for a file already at the root', () => {
    const root = path.resolve('/repo');

    expect(toBaselineKey(path.join(root, 'main.ts'), root)).toBe('main.ts');
  });
});

describe('baseNameOf', () => {
  it('returns the segment after the last slash', () => {
    expect(baseNameOf('src/app/user.component.ts')).toBe('user.component.ts');
  });

  it('returns the whole key when there is no slash', () => {
    expect(baseNameOf('main.ts')).toBe('main.ts');
  });
});
