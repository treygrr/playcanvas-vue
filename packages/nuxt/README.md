# @treygrr/playcanvas-nuxt

Play [PlayCanvas Editor](https://playcanvas.com) projects in Nuxt, and release them from a built-in admin. Publish in the Editor, and the module imports the build onto your own server; put the scene on any page with `<PlayCanvasScene>`.

Projects come from two places:

- **The admin (CMS):** track PlayCanvas projects by id. Their published apps are imported automatically, and you choose which version is live.
- **Zips in the repo:** drop Editor downloads in `playcanvas/`. Handy for local work and static sites.

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

## The admin

Set an admin password and your PlayCanvas API token, then open `/_playcanvas`:

```bash
# .env, next to nuxt.config.ts
NUXT_PLAYCANVAS_TOKEN=…            # from your PlayCanvas account page → API Tokens
NUXT_PLAYCANVAS_ADMIN_PASSWORD=…   # to log in to the admin
```

1. **Add a project** by its id, or paste its Editor link (`playcanvas.com/editor/project/1234567`). Its slug comes from the app name, and you can choose your own.
2. **Publish in the Editor.** Each published app becomes a version, with the version label and release notes you set when publishing. The newest and the Editor's primary app are downloaded to your server; older ones can be imported from their row.
3. **Make a version live.** Until then the project returns 404. Every downloaded version has a preview link (`/play/<slug>?preview=…`) that works even before it's live.

Per project you can also:

- **Auto-release** (off by default): make the Editor's primary app live as soon as it's imported, so publishing in the Editor is the release. Changing the primary app back is a rollback.
- **Pin**: keep the current version when auto-release is on. Choosing a version by hand pins it.
- **Go offline**, now or at a set time. Visitors get a 404; preview links still work.

### Syncing

The module checks PlayCanvas for new published apps in the background when a project is requested, at most every 5 minutes, and from the admin's **Sync now**. For a schedule instead, eg a cron job on Vercel or Netlify, set a secret and call the sync endpoint:

```bash
NUXT_PLAYCANVAS_SYNC_SECRET=…   # enables POST /_playcanvas/api/sync
```

```bash
curl -X POST https://example.com/_playcanvas/api/sync -H "Authorization: Bearer $NUXT_PLAYCANVAS_SYNC_SECRET"
# or one project: -H 'content-type: application/json' -d '{"slug":"my-game"}'
```

### Storage

Imported versions are kept in Nitro storage, under the `playcanvas` mount. By default that's the `.data/playcanvas` folder, which suits a single Node server. On serverless hosts, whose disks don't persist, use object storage:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
    nitro: {
        storage: {
            playcanvas: {
                driver: 's3',
                bucket: 'my-bucket',
                region: 'auto',
                endpoint: process.env.S3_ENDPOINT,
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
            }
        }
    }
});
```

Any [unstorage driver](https://unstorage.unjs.io/drivers) works: S3, Cloudflare R2, Vercel Blob, Netlify Blobs, and more.

### Using your own auth

Instead of the password, let your app decide who can use the admin with a Nitro plugin. Set `auth.allowed`; leave it unset to fall back to the password:

```ts
// server/plugins/playcanvas-auth.ts
export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('playcanvas:authorize', async (event, auth) => {
        const user = await getUserFromSession(event); // your auth
        auth.allowed = user?.role === 'admin';
    });
});
```

With neither a password nor a hook, the admin is disabled.

## Zips in the repo

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

- **Repo zips:** at build time and in `nuxt dev`, each zip is validated and unpacked. Invalid zips fail the build, so a broken export never deploys. In dev, changes to the folder are picked up live.
- **What's served:** only the project's files: its config, scenes, scripts and assets. The Editor's launch page and bundled engine are dropped, since your app's `playcanvas` package runs the project.
- **Published apps:** only the files listed in the build's config are downloaded, from that build's folder on `playcanv.as`, and checked like zips. An import that fails is retried with backoff; one that's incomplete never goes live.
- **Caching:** versions never change once imported, so their files are cached as immutable. `/_playcanvas/projects/<slug>.json` says which version is live, and is never cached. Repo zips are served at the same URL, ahead of the CMS.
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
        // URL the project files and API are served from
        baseURL: '/_playcanvas',
        // Route of the admin, or false to disable it
        admin: '/_playcanvas',
        // Background syncing of PlayCanvas projects
        sync: { onRequest: true, interval: 300 },
        // Limits for unpacking a zip or published app
        limits: { maxSize: 512 * 1024 * 1024, maxFiles: 10_000 }
    }
});
```

### Environment variables

| Variable                         | Purpose                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `NUXT_PLAYCANVAS_TOKEN`          | PlayCanvas API token, for importing published apps. Server only.                            |
| `NUXT_PLAYCANVAS_ADMIN_PASSWORD` | Enables the admin's password login.                                                         |
| `NUXT_PLAYCANVAS_SESSION_SECRET` | Optional, at least 32 characters. Seals admin sessions; derived from the password if unset. |
| `NUXT_PLAYCANVAS_SYNC_SECRET`    | Enables `POST /_playcanvas/api/sync`.                                                       |

## Security

- **Projects are code.** Editor projects contain scripts, which run in your visitors' browsers like any other code on your site. Anyone who can use the admin, or publish to a tracked project while auto-release is on, can change what runs on your site.
- **Imports are checked:** paths that would escape their folder (`../`, absolute paths) are rejected, published apps are only downloaded from `playcanv.as`, and size and file-count limits apply. HTML and SVG files from projects are served sandboxed.
- **The admin:** sessions are sealed, `HttpOnly`, `SameSite=Strict` cookies, only sent to the admin API. Changes require a custom header, so other sites can't make them through a logged-in browser. Password attempts are rate limited per IP.
- **The token** stays on the server, in private runtime config; it isn't included in client bundles.

## License

MIT
