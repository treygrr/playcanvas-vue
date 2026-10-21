# @treygrr/playcanvas-vue

_⚡ A full-featured library for interactive 3D in Vue — because your 3D scene deserves a framework that doesn't re-render it into the ground._

PlayCanvas already has a lovely [React renderer](https://github.com/playcanvas/react). Which is great, if you enjoy dependency arrays, `useCallback` around everything, and wondering why your effect ran twice. For the rest of us, there's Vue. Real reactivity, templates that read like templates, and no need to memoize your feelings.

So here it is: `@treygrr/playcanvas-vue`, a thin wrapper around [PlayCanvas](https://github.com/playcanvas/engine), a battle-tested real-time 3D engine. It has the same components and features as [`@playcanvas/react`](https://github.com/playcanvas/react), expressed the way nature intended: slots, template refs, `@events`, and composables.

### Features

- 🎭 Simple, declarative scene API
- 👆 Pointer events (`@click`, `@pointerdown`, `@pointerover`, ...)
- 🛠️ Physics out of the box
- ⚡ Script component
- 🧩 glTF scene modification (`<Gltf>` and `<Modify.*>`)
- 🎮 Plays PlayCanvas Editor projects, with a [Nuxt module](packages/nuxt) for zipped exports
- 🔷 Every engine property is a typed Vue prop, checked in templates by `vue-tsc`

## Getting Started

```bash
npm install @treygrr/playcanvas-vue playcanvas
```

### Show me the code

Here's how you render a sphere.

```vue
<script setup lang="ts">
import { Application, Entity } from '@treygrr/playcanvas-vue';
import { Camera, Light, Render, Script } from '@treygrr/playcanvas-vue/components';
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
</script>

<template>
    <Application>
        <Entity :position="[0, 2, 6]">
            <Camera />
            <Script :script="CameraControls" />
        </Entity>
        <Entity :rotation="[45, 30, 0]">
            <Light type="directional" cast-shadows />
        </Entity>
        <Render type="sphere" />
    </Application>
</template>
```

Et voilà! ✨

### Interactivity and composables

```vue
<script setup lang="ts">
import { Entity } from '@treygrr/playcanvas-vue';
import { Render } from '@treygrr/playcanvas-vue/components';
import { useAppEvent, useMaterial } from '@treygrr/playcanvas-vue/composables';
import { ref } from 'vue';

const hovered = ref(false);
const rotation = ref<[number, number, number]>([0, 0, 0]);

// The material updates whenever `hovered` changes
const material = useMaterial(() => ({ diffuse: hovered.value ? 'orange' : 'white' }));

useAppEvent('update', (dt) => {
    rotation.value = [0, rotation.value[1] + dt * 45, 0];
});
</script>

<template>
    <Entity :rotation="rotation" @pointerover="hovered = true" @pointerout="hovered = false">
        <Render type="box" :material="material" />
    </Entity>
</template>
```

### Loading assets

Asset composables return refs, so they can be destructured and used directly in templates. Pass a ref or getter as the source to reload when it changes.

```vue
<script setup lang="ts">
import { useModel } from '@treygrr/playcanvas-vue/composables';

const { asset, loading, error } = useModel('/statue.glb');
</script>

<template>
    <Render v-if="asset" type="asset" :asset="asset" />
</template>
```

### Modifying glTF scenes

```vue
<template>
    <Gltf v-if="asset" :asset="asset" :key="asset.id">
        <!-- Remove every light in the model -->
        <Modify.Node path="**[light]">
            <Modify.Light remove />
        </Modify.Node>

        <!-- Double the intensity of one light -->
        <Modify.Node path="Rig.KeyLight">
            <Modify.Light :intensity="(value) => value * 2" />
        </Modify.Node>

        <!-- Attach new content to a node -->
        <Modify.Node path="Robot.Body.Head">
            <Entity :position="[0, 0.5, 0]">
                <Render type="cone" />
            </Entity>
        </Modify.Node>
    </Gltf>
</template>
```

### Playing PlayCanvas Editor projects

Build scenes in the [PlayCanvas Editor](https://playcanvas.com), then play them in Vue. Download a build from the Editor, unzip it into `public/`, and point `<EditorProject>` at it. Your Editor scripts, physics and UI keep working, and Vue children are added to the scene.

```vue
<script setup lang="ts">
import { EditorProject, Entity, Modify } from '@treygrr/playcanvas-vue';
import { Render } from '@treygrr/playcanvas-vue/components';
</script>

<template>
    <!-- the Editor download unzipped into public/exports/my-game/ -->
    <EditorProject src="/exports/my-game/" class="h-96">
        <template #loading>Loading…</template>

        <!-- Change entities from the Editor scene -->
        <Modify.Node path="**.Light">
            <Modify.Light :intensity="(value) => value * 1.5" />
        </Modify.Node>

        <!-- Or add your own -->
        <Entity :position="[0, 2, 0]">
            <Render type="cone" />
        </Entity>
    </EditorProject>
</template>
```

Using Nuxt? [`@treygrr/playcanvas-nuxt`](packages/nuxt) adds a CMS: track your PlayCanvas projects in an admin, and their published builds are imported onto your server, ready to release. Then use `<PlayCanvasScene project="my-game" />` anywhere.

## Coming from `@playcanvas/react`

| React                                        | Vue                                                             |
| -------------------------------------------- | --------------------------------------------------------------- |
| `<Light castShadows />`                      | `<Light cast-shadows />` (or `castShadows`)                     |
| `<Entity position={[0, 1, 0]} />`            | `<Entity :position="[0, 1, 0]" />`                              |
| `onPointerDown={fn}`, `onClick={fn}`         | `@pointerdown="fn"`, `@click="fn"`                              |
| `className`, `style` on `<Application>`      | `class`, `style` (merged with the defaults)                     |
| `<ApplicationWithoutCanvas canvasRef={ref}>` | `<ApplicationWithoutCanvas :canvas="canvasEl">`                 |
| `ref` on `<Entity>` → `PcEntity`             | template ref → `entityRef.value.entity`                         |
| `ref` on `<Script>` → script instance        | template ref → `scriptRef.value.script`                         |
| `@playcanvas/react/hooks`                    | `@treygrr/playcanvas-vue/composables`                           |
| `const { asset } = useModel(src)` (values)   | `const { asset } = useModel(src)` (refs, `src` can be reactive) |
| `useMaterial({ diffuse })`                   | `useMaterial(() => ({ diffuse: color.value }))`                 |
| `useEntity(path)` → value                    | `useEntity(path)` → computed ref                                |
| `usePhysics()` → object                      | `usePhysics()` → reactive object                                |
| `<Gizmo onCommit={fn} />`                    | `<Gizmo @commit="fn" />`                                        |

Deprecated APIs from the React package (`useFrame`, `<OrbitControls>`, `AutoRotator`) are not included. Use `useAppEvent('update', ...)` and the engine's `CameraControls` script instead.

## Development

This is a pnpm workspace:

- `packages/lib`: the `@treygrr/playcanvas-vue` library
- `packages/nuxt`: the `@treygrr/playcanvas-nuxt` module, with a playground app
- `packages/examples`: a Vite app using the library from `.vue` files. `editor.html` plays an Editor export from `public/exports/`

```bash
pnpm install
pnpm test        # unit tests (Vitest + @vue/test-utils)
pnpm typecheck   # tsc for the library, vue-tsc for the module and examples
pnpm build       # build the library and the Nuxt module
pnpm dev         # run the examples app
pnpm dev:nuxt    # run the Nuxt playground (put an Editor zip in packages/nuxt/playground/playcanvas/)
```

## License

MIT
