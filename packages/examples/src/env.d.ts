declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent;
    export default component;
}

declare module 'playcanvas/scripts/esm/camera-controls.mjs' {
    import type { Script } from 'playcanvas';
    export class CameraControls extends Script {}
}
