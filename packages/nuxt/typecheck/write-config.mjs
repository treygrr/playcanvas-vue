// Writes .nuxt/tsconfig.typecheck.json: Nuxt's generated config, with `#imports` pointing at
// typecheck/app-imports.d.ts. A config's `paths` replaces its parent's, so they are all copied.
import { readFileSync, writeFileSync } from 'node:fs';

const stripComments = (text) => text.replace(/^\s*\/\/.*$/gm, '');
const generated = JSON.parse(stripComments(readFileSync('.nuxt/tsconfig.json', 'utf8')));

writeFileSync(
    '.nuxt/tsconfig.typecheck.json',
    JSON.stringify(
        {
            extends: '../tsconfig.json',
            compilerOptions: {
                paths: { ...generated.compilerOptions.paths, '#imports': ['../typecheck/app-imports.d.ts'] }
            }
        },
        null,
        2
    )
);
