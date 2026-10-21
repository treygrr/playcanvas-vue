# playcanvas-vue

_⚡ A full-featured library for interactive 3D in Vue — because your 3D scene deserves a framework that doesn't re-render it into the ground._

PlayCanvas already has a lovely [React renderer](https://github.com/playcanvas/react). Which is great, if you enjoy dependency arrays, `useCallback` around everything, and wondering why your effect ran twice. For the rest of us, there's Vue. Real reactivity, templates that read like templates, and no need to memoize your feelings.

So here it is: a thin Vue wrapper around [PlayCanvas](https://github.com/playcanvas/engine), a battle-tested real-time 3D engine. It has the same components and features as [`@playcanvas/react`](https://github.com/playcanvas/react), expressed the way nature intended: slots, template refs, `@events`, and composables. And for Nuxt, a module that turns your PlayCanvas projects into a CMS.

## Packages

### [`@treygrr/playcanvas-vue`](packages/lib#readme): PlayCanvas for Vue

Build 3D scenes with Vue components, and play PlayCanvas Editor projects in any Vue app.

```bash
npm install @treygrr/playcanvas-vue playcanvas
```

```vue
<template>
    <Application>
        <Entity :position="[0, 2, 6]">
            <Camera />
        </Entity>
        <Entity :rotation="[45, 30, 0]">
            <Light type="directional" cast-shadows />
        </Entity>
        <Render type="sphere" />
    </Application>
</template>
```

**[Read the Vue docs →](packages/lib#readme)**

### [`@treygrr/playcanvas-nuxt`](packages/nuxt#readme): a PlayCanvas CMS for Nuxt

Track your PlayCanvas projects in an admin at `/_playcanvas`. Their published builds are imported onto your own server, ready to release, preview, schedule or roll back. Then put them on any page.

```bash
npm install @treygrr/playcanvas-nuxt playcanvas
```

```vue
<template>
    <PlayCanvasScene project="my-game" class="h-96" />
</template>
```

**[Read the Nuxt docs →](packages/nuxt#readme)**

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
