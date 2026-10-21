import type { EditorConfig } from '../../src/editor/manifest.ts';

/**
 * A trimmed `config.json` in the shape the PlayCanvas Editor exports, with Ammo physics and two scripts.
 */
export const editorConfig: EditorConfig = {
    application_properties: {
        antiAlias: true,
        enableWebGl2: true,
        enableWebGpu: false,
        fillMode: 'FILL_WINDOW',
        resolutionMode: 'AUTO',
        width: 1280,
        height: 720,
        powerPreference: 'default',
        preserveDrawingBuffer: false,
        transparentCanvas: false,
        scripts: [101, 102],
        useGamepads: false,
        useKeyboard: true,
        useMouse: true,
        useTouch: true
    },
    scenes: [
        { name: 'Main Scene', url: '1000.json' },
        { name: 'Level 2', url: '1001.json' }
    ],
    assets: {
        '101': { type: 'script', file: { url: '__game-scripts.js' }, data: { scripts: {} } },
        '102': { type: 'script', file: { url: '__game-scripts.js' }, data: { scripts: {} } },
        '201': { type: 'script', file: { url: 'files/assets/201/1/ammo.wasm.js' }, data: {} },
        '202': { type: 'script', file: { url: 'files/assets/202/1/ammo.js' }, data: {} },
        '203': {
            type: 'wasm',
            file: { url: 'files/assets/203/1/ammo.wasm.wasm' },
            data: { moduleName: 'Ammo', glueScriptId: 201, fallbackScriptId: 202, loadingType: 0 }
        },
        '301': { type: 'texture', file: { url: 'files/assets/301/1/ball.png' }, data: {} }
    }
};
