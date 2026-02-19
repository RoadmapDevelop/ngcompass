import { Component } from '@angular/core';

@Component({
  selector: 'bad-selector',
  template: `<div>{{ getValue() }}</div>`,
})
export class TestVerboseComponent {
  getValue() {
    return 'hello';
  }
}
