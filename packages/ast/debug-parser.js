
import { parse } from 'angular-html-parser';

const template = `
@for (item of items; track item.id) {
  <div>{{ item.name }}</div>
} @empty {
  <p>Empty</p>
}
`;

const result = parse(template, { tokenizeAngularBlocks: true });

function findBlocks(nodes, indent = '') {
    for (const node of nodes) {
        console.log(`${indent}Node: ${node.constructor.name}, kind: ${node.kind}, name: ${node.name || 'N/A'}`);
        if (node.constructor.name === 'Block' || node.kind === 'block') {
            console.log(`${indent}  - Parameters:`, node.parameters?.map(p => p.expression));
        }
        if (node.children) findBlocks(node.children, indent + '  ');
    }
}

findBlocks(result.rootNodes);
