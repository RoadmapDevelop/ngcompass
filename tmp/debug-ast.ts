import { parseTs } from './packages/ast/src/index.ts';

const source = `
import { ChangeDetectorRef } from '@angular/core';
class AppComponent {
    constructor(private cdr: ChangeDetectorRef) {}
    update() { this.cdr.detectChanges(); }
}`;

const { program } = parseTs(source, 'test.ts');
console.log(JSON.stringify(program, (key, value) => {
    if (key === 'parent' || key === 'span' || key === 'loc') return undefined;
    return value;
}, 2));
