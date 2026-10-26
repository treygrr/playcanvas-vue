export default defineNuxtConfig({
    // Nuxt UI is only needed for the admin
    modules: ['@nuxt/ui', '../src/module'],
    css: ['~/assets/css/main.css'],
    compatibilityDate: '2026-10-01',
    devtools: { enabled: false }
});
