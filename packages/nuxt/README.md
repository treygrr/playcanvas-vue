# @treygrr/playcanvas-nuxt

Play [PlayCanvas Editor](https://playcanvas.com) projects in Nuxt. Download a build from the Editor, drop the zip in your project, and put the scene on any page.

Built on [`@treygrr/playcanvas-vue`](https://github.com/treygrr/playcanvas-vue), so you can mix Vue components into the Editor scene.

## Setup

```bash
npm install @treygrr/playcanvas-nuxt playcanvas
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['@treygrr/playcanvas-nuxt']
});
```

## Usage

1. In the Editor, open your project's **Publish** page, choose **Download .zip**, and save it in a `playcanvas/` folder next to `nuxt.config.ts`.
2. Each zip becomes a project, named from its file name: `playcanvas/My First Project.zip` is `my-first-project`.

It plays full-window at `/play/my-first-project`, and anywhere with `<PlayCanvasScene>`:

```vue
<script setup lang="ts">
import { Entity, Modify } from '@treygrr/playcanvas-vue';
import { Render } from '@treygrr/playcanvas-vue/components';
</script>

<template>
    <h1>Our showroom</h1>

    <PlayCanvasScene project="my-first-project" class="h-96">
        <template #loading>Loading…</template>
        <template #error="{ error }">{{ error.message }}</template>

        <!-- Change entities from the Editor scene… -->
        <Modify.Node path="**.Light">
            <Modify.Light :intensity="(value) => value * 1.5" />
        </Modify.Node>

        <!-- …or add your own -->
        <Entity :position="[0, 2, 0]">
            <Render type="cone" />
        </Entity>
    </PlayCanvasScene>
</template>
```

### `<PlayCanvasScene>`

| Prop                          | Description                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `project`                     | The project slug. Projects in `playcanvas/` autocomplete.                        |
| `scene`                       | The scene name to load. Defaults to the project's first scene.                   |
| `use-project-canvas-settings` | Fill the window with the project's canvas settings, like the Editor launch page. |

Other attributes go to the underlying `<Application>`: `class` and `style` style the canvas. Add `keyboard-target="canvas" tabindex="0"` so the scene only takes key presses while it's focused, which matters when a page has more than one.

| Event     | Payload                                        |
| --------- | ---------------------------------------------- |
| `project` | The project info, once fetched                 |
| `loaded`  | The root entity of the scene, once it's loaded |
| `error`   | An `Error` if the project or scene failed      |

The scene only renders in the browser. On the server, the component renders nothing.

## How it works

- **Build time:** at build time and in `nuxt dev`, each zip is validated and unpacked. Invalid zips fail the build, so a broken export never deploys. In dev, changes to the folder are picked up live.
- **What's served:** only the project's files: its config, scenes, scripts and assets. The Editor's launch page and bundled engine are dropped, since your app's `playcanvas` package runs the project.
- **Caching:** each version is served from a folder named after a hash of the zip, `/_playcanvas/assets/<slug>/<hash>/`, cached as immutable. `/_playcanvas/projects/<slug>.json` says which version is live, and is never cached.
- **Engine version:** keep the engine version used by the Editor and by your app's `playcanvas` package close. The build warns when they differ.

## Options

```ts
export default defineNuxtConfig({
    modules: ['@treygrr/playcanvas-nuxt'],
    playcanvas: {
        // Folder holding the zips, relative to the project root
        dir: 'playcanvas',
        // Prefix for the full-window pages, or false to disable them
        route: '/play',
        // URL the project files are served from
        baseURL: '/_playcanvas',
        // Limits for unpacking a zip
        limits: { maxSize: 512 * 1024 * 1024, maxFiles: 10_000 }
    }
});
```

## Security

Editor projects contain scripts, which run in your visitors' browsers like any other code on your site. Only add exports you trust. Zips are checked before unpacking: paths that would escape the output folder (`../`, absolute paths) are rejected, and size and file-count limits apply.

## License

MIT
