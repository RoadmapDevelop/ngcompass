/**
 * File Type Detection Tests
 */

import { describe, it, expect } from 'vitest';
import {
    detectFileType,
    isTypeScriptFile,
    isTemplateFile,
    isStyleFile,
    isSpecFile,
    isComponentFile,
    getBaseName,
} from '../../src/planner/file-type.js';

describe('detectFileType', () => {
    it('detects component files', () => {
        expect(detectFileType('src/app/user.component.ts')).toBe('component');
        expect(detectFileType('/absolute/path/header.component.ts')).toBe('component');
    });

    it('detects directive files', () => {
        expect(detectFileType('src/app/highlight.directive.ts')).toBe('directive');
    });

    it('detects pipe files', () => {
        expect(detectFileType('src/app/currency.pipe.ts')).toBe('pipe');
    });

    it('detects service files', () => {
        expect(detectFileType('src/app/auth.service.ts')).toBe('service');
        expect(detectFileType('src/app/user/user.service.ts')).toBe('service');
    });

    it('detects module files', () => {
        expect(detectFileType('src/app/app.module.ts')).toBe('module');
    });

    it('detects guard files', () => {
        expect(detectFileType('src/app/auth.guard.ts')).toBe('guard');
    });

    it('detects template files', () => {
        expect(detectFileType('src/app/user.component.html')).toBe('template');
        expect(detectFileType('src/app/header.html')).toBe('template');
    });

    it('detects style files', () => {
        expect(detectFileType('src/app/user.component.css')).toBe('style');
        expect(detectFileType('src/app/user.component.scss')).toBe('style');
        expect(detectFileType('src/app/user.component.sass')).toBe('style');
        expect(detectFileType('src/app/user.component.less')).toBe('style');
    });

    it('detects config files', () => {
        expect(detectFileType('src/app/app.config.ts')).toBe('config');
        expect(detectFileType('tsconfig.json')).toBe('config');
        expect(detectFileType('package.json')).toBe('config');
    });

    it('defaults to logic for plain TypeScript files', () => {
        expect(detectFileType('src/app/utils.ts')).toBe('logic');
        expect(detectFileType('src/app/models/user.ts')).toBe('logic');
        expect(detectFileType('src/main.ts')).toBe('logic');
    });
});

describe('isTypeScriptFile', () => {
    it('returns true for .ts files', () => {
        expect(isTypeScriptFile('file.ts')).toBe(true);
        expect(isTypeScriptFile('component.component.ts')).toBe(true);
    });

    it('returns false for non-.ts files', () => {
        expect(isTypeScriptFile('file.html')).toBe(false);
        expect(isTypeScriptFile('file.css')).toBe(false);
        expect(isTypeScriptFile('file.js')).toBe(false);
    });
});

describe('isTemplateFile', () => {
    it('returns true for .html files', () => {
        expect(isTemplateFile('file.html')).toBe(true);
        expect(isTemplateFile('component.component.html')).toBe(true);
    });

    it('returns false for non-.html files', () => {
        expect(isTemplateFile('file.ts')).toBe(false);
        expect(isTemplateFile('file.css')).toBe(false);
    });
});

describe('isStyleFile', () => {
    it('returns true for style files', () => {
        expect(isStyleFile('file.css')).toBe(true);
        expect(isStyleFile('file.scss')).toBe(true);
        expect(isStyleFile('file.sass')).toBe(true);
        expect(isStyleFile('file.less')).toBe(true);
    });

    it('returns false for non-style files', () => {
        expect(isStyleFile('file.ts')).toBe(false);
        expect(isStyleFile('file.html')).toBe(false);
    });
});

describe('isSpecFile', () => {
    it('returns true for spec files', () => {
        expect(isSpecFile('user.spec.ts')).toBe(true);
        expect(isSpecFile('user.component.spec.ts')).toBe(true);
        expect(isSpecFile('auth.service.spec.ts')).toBe(true);
    });

    it('returns false for non-spec files', () => {
        expect(isSpecFile('user.ts')).toBe(false);
        expect(isSpecFile('user.component.ts')).toBe(false);
    });
});

describe('isComponentFile', () => {
    it('returns true for component files', () => {
        expect(isComponentFile('user.component.ts')).toBe(true);
        expect(isComponentFile('header.component.ts')).toBe(true);
    });

    it('returns false for non-component files', () => {
        expect(isComponentFile('user.service.ts')).toBe(false);
        expect(isComponentFile('user.ts')).toBe(false);
        expect(isComponentFile('user.html')).toBe(false);
    });
});

describe('getBaseName', () => {
    it('extracts base name from component files', () => {
        expect(getBaseName('user.component.ts')).toBe('user');
        expect(getBaseName('header.component.ts')).toBe('header');
    });

    it('extracts base name from directive files', () => {
        expect(getBaseName('highlight.directive.ts')).toBe('highlight');
    });

    it('extracts base name from pipe files', () => {
        expect(getBaseName('currency.pipe.ts')).toBe('currency');
    });

    it('extracts base name from service files', () => {
        expect(getBaseName('auth.service.ts')).toBe('auth');
    });

    it('extracts base name from spec files', () => {
        expect(getBaseName('user.spec.ts')).toBe('user');
        expect(getBaseName('user.component.spec.ts')).toBe('user.component');
    });

    it('removes extension for other files', () => {
        expect(getBaseName('utils.ts')).toBe('utils');
        expect(getBaseName('main.ts')).toBe('main');
    });

    it('handles absolute paths', () => {
        expect(getBaseName('/abs/path/user.component.ts')).toBe('user');
        expect(getBaseName('C:\\abs\\path\\user.component.ts')).toBe('user');
    });
});
