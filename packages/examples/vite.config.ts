import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const lib = fileURLToPath(new URL('../lib/src', import.meta.url));

export default defineConfig({
    plugins: [vue()],
    build: {
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL('index.html', import.meta.url)),
                editor: fileURLToPath(new URL('editor.html', import.meta.url))
            }
        }
    },
    resolve: {
        // Use the library source, so changes show up without rebuilding it
        alias: [
            { find: /^@treygrr\/playcanvas-vue$/, replacement: `${lib}/index.ts` },
            { find: /^@treygrr\/playcanvas-vue\/(.*)$/, replacement: `${lib}/$1/index.ts` }
        ]
    }
});
