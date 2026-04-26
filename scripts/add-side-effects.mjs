import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const packagesDir = path.join(projectRoot, 'packages');
const packages = fs.readdirSync(packagesDir);

for (const pkg of packages) {
    const pkgPath = path.join(packagesDir, pkg);
    if (!fs.statSync(pkgPath).isDirectory()) continue;
    
    const pkgJsonPath = path.join(pkgPath, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    
    // Add sideEffects field right after "name", "version", etc if we could order it,
    // but JSON.stringify will just put it at the end normally unless we reconstruct the object.
    const newPkgJson = {
        name: pkgJson.name,
        version: pkgJson.version,
        description: pkgJson.description,
        sideEffects: false,
        ...pkgJson // This will overwrite name, version, etc. but order will be preserved for the first keys
    };
    newPkgJson.sideEffects = false; // Just to be sure it's overwritten correctly if it already existed
    
    fs.writeFileSync(pkgJsonPath, JSON.stringify(newPkgJson, null, 4) + '\n');
    process.stdout.write(`Updated ${pkg}\n`);
}
