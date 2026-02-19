
import { Component } from '@angular/core';

@Component({
    selector: 'app-test',
    standalone: false,
    template: `
    <div *ngIf="true">Hello</div>
  `
})
export class TestComponent { }
