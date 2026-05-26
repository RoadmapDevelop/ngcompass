import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  isTypeScriptFile,
  isTemplateFile,
  isStyleFile,
  isSpecFile,
  isComponentFile,
  getBaseName,
} from '../src/file-type.js';

describe('detectFileType', () => {
  it('detects component files', () => {
    expect(detectFileType('/src/app/app.component.ts')).toBe('component');
    expect(detectFileType('user.component.ts')).toBe('component');
  });

  it('detects directive files', () => {
    expect(detectFileType('/src/app/highlight.directive.ts')).toBe('directive');
  });

  it('detects pipe files', () => {
    expect(detectFileType('/src/app/date.pipe.ts')).toBe('pipe');
  });

  it('detects service files', () => {
    expect(detectFileType('/src/app/auth.service.ts')).toBe('service');
  });

  it('detects module files', () => {
    expect(detectFileType('/src/app/app.module.ts')).toBe('module');
  });

  it('detects guard files', () => {
    expect(detectFileType('/src/app/auth.guard.ts')).toBe('guard');
  });

  it('detects template files by .html extension', () => {
    expect(detectFileType('/src/app/app.component.html')).toBe('template');
    expect(detectFileType('view.html')).toBe('template');
  });

  it('detects style files by css/scss/sass/less extension', () => {
    expect(detectFileType('app.component.css')).toBe('style');
    expect(detectFileType('app.component.scss')).toBe('style');
    expect(detectFileType('app.component.sass')).toBe('style');
    expect(detectFileType('app.component.less')).toBe('style');
  });

  it('detects config files', () => {
    expect(detectFileType('app.config.ts')).toBe('config');
    expect(detectFileType('package.json')).toBe('config');
    expect(detectFileType('tsconfig.json')).toBe('config');
  });

  it('falls back to logic for unknown patterns', () => {
    expect(detectFileType('/src/utils/helpers.ts')).toBe('logic');
    expect(detectFileType('main.ts')).toBe('logic');
  });

  it('prioritises Angular suffix over plain extension', () => {
    expect(detectFileType('foo.service.ts')).toBe('service');
  });
});

describe('isTypeScriptFile', () => {
  it('returns true for .ts files', () => {
    expect(isTypeScriptFile('app.ts')).toBe(true);
    expect(isTypeScriptFile('app.component.ts')).toBe(true);
  });

  it('returns false for non-ts files', () => {
    expect(isTypeScriptFile('app.html')).toBe(false);
    expect(isTypeScriptFile('app.js')).toBe(false);
  });
});

describe('isTemplateFile', () => {
  it('returns true for .html files', () => {
    expect(isTemplateFile('view.html')).toBe(true);
  });

  it('returns false for non-html files', () => {
    expect(isTemplateFile('view.ts')).toBe(false);
  });
});

describe('isStyleFile', () => {
  it('returns true for known style extensions', () => {
    expect(isStyleFile('a.css')).toBe(true);
    expect(isStyleFile('a.scss')).toBe(true);
    expect(isStyleFile('a.sass')).toBe(true);
    expect(isStyleFile('a.less')).toBe(true);
  });

  it('returns false for non-style files', () => {
    expect(isStyleFile('a.ts')).toBe(false);
    expect(isStyleFile('a.html')).toBe(false);
  });
});

describe('isSpecFile', () => {
  it('returns true for *.spec.ts files', () => {
    expect(isSpecFile('app.component.spec.ts')).toBe(true);
    expect(isSpecFile('user.spec.ts')).toBe(true);
  });

  it('returns false for non-spec files', () => {
    expect(isSpecFile('app.component.ts')).toBe(false);
    expect(isSpecFile('spec.ts')).toBe(false);
  });
});

describe('isComponentFile', () => {
  it('returns true for *.component.ts files', () => {
    expect(isComponentFile('app.component.ts')).toBe(true);
  });

  it('returns false for non-component files', () => {
    expect(isComponentFile('app.service.ts')).toBe(false);
    expect(isComponentFile('component.ts')).toBe(false);
  });
});

describe('getBaseName', () => {
  it('strips .component.ts suffix', () => {
    expect(getBaseName('app.component.ts')).toBe('app');
    expect(getBaseName('/src/app/user.component.ts')).toBe('user');
  });

  it('strips .service.ts suffix', () => {
    expect(getBaseName('auth.service.ts')).toBe('auth');
  });

  it('strips .module.ts suffix', () => {
    expect(getBaseName('app.module.ts')).toBe('app');
  });

  it('strips .directive.ts suffix', () => {
    expect(getBaseName('highlight.directive.ts')).toBe('highlight');
  });

  it('strips .pipe.ts suffix', () => {
    expect(getBaseName('date.pipe.ts')).toBe('date');
  });

  it('strips .guard.ts suffix', () => {
    expect(getBaseName('auth.guard.ts')).toBe('auth');
  });

  it('strips .spec.ts suffix', () => {
    expect(getBaseName('app.component.spec.ts')).toBe('app.component');
  });

  it('falls back to basename without extension for unknown patterns', () => {
    expect(getBaseName('helpers.ts')).toBe('helpers');
    expect(getBaseName('/utils/math.ts')).toBe('math');
  });
});
