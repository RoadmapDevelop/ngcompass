const fs = require('fs');
const path = require('path');

const searchDir = path.join(__dirname, '../packages/rules/src');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.ts')) results.push(file);
        }
    });
    return results;
}

const files = walk(searchDir);

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Replace imports from relative path pointing to types or types.js
    // examples: from '../types.js', from '../../types.js', from './types.js', from './types' etc.
    let newContent = content.replace(/(from\s+['"])(?:\.\.\/|\.\/)+types(?:\.js)?(['"])/g, '$1@ngcompass/common$2');
    
    // Also we might have `import { RuleFailure } from "../types.js"`
    if (newContent !== content) {
        fs.writeFileSync(file, newContent, 'utf-8');
        process.stdout.write(`Updated: ${file}\n`);
    }
});
process.stdout.write('Done.\n');
