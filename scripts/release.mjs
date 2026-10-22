// Bumps both published packages to the same version, commits, and tags it.
// Pushing the tag runs .github/workflows/release.yml, which publishes to npm.
//
//   pnpm release 0.2.0

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGES = ['packages/lib/package.json', 'packages/nuxt/package.json'];

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
    console.error('Usage: pnpm release <version>, eg pnpm release 0.2.0');
    process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (execSync('git status --porcelain').toString().trim()) {
    console.error('Commit or stash your changes first.');
    process.exit(1);
}

for (const path of PACKAGES) {
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    pkg.version = version;
    writeFileSync(path, `${JSON.stringify(pkg, null, 4)}\n`);
}

run(`git add ${PACKAGES.join(' ')}`);
run(`git commit -m "chore: release v${version}"`);
run(`git tag v${version}`);

console.log(`\nTagged v${version}. Push to publish:\n\n  git push --follow-tags\n`);
