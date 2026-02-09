
import { initHasher, hashFile } from './src/planner/hashing.js';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const run = async () => {
    console.log('Initializing hasher...');
    await initHasher();

    const testFile = join(process.cwd(), 'temp-test-file.ts');

    // 1. Create file
    console.log('Creating initial file...');
    await writeFile(testFile, 'const a = 1;');

    // 2. Hash it
    const hash1 = await hashFile(testFile);
    console.log(`Hash 1: ${hash1}`);

    // 3. Change file
    console.log('Modifying file...');
    await writeFile(testFile, 'const a = 2;');

    // 4. Hash again
    const hash2 = await hashFile(testFile);
    console.log(`Hash 2: ${hash2}`);

    // 5. Cleanup
    await unlink(testFile);

    if (hash1 === hash2) {
        console.error('FAIL: Hash did not change!');
        process.exit(1);
    } else {
        console.log('PASS: Hash changed correctly.');
    }
};

run().catch(console.error);
