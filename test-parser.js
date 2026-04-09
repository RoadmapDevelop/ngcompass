
import { parse } from 'angular-html-parser';

const template = `
@for (item of items; track item.id) {
  <div>{{ item.name }}</div>
}
`;

const result = parse(template);
console.log(JSON.stringify(result.rootNodes, null, 2));
