import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const lib = fileURLToPath(new URL('../lib/src', import.meta.url));

export default defineConfig({
    plugins: [vue()],
    resolve: {
        // Use the library source, so changes show up without rebuilding it
        alias: [
            { find: /^@playcanvas\/vue$/, replacement: `${lib}/index.ts` },
            { find: /^@playcanvas\/vue\/(.*)$/, replacement: `${lib}/$1/index.ts` }
        ]
    }
});
