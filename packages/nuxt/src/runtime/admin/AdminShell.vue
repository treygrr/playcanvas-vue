<script setup lang="ts">
/**
 * The admin's frame: a header, and a login gate. The default slot only renders once logged in.
 */
import { onMounted, ref, watch } from 'vue';

import { useHead } from '#imports';

import type { AuthState } from './api';
import { errorMessage, useAdminApi } from './api';

defineProps<{ title?: string }>();

defineSlots<{ default?: () => unknown; actions?: () => unknown }>();

/** Emitted once the visitor is logged in, so pages only load data they have access to */
const emit = defineEmits<{ authenticated: [] }>();

const api = useAdminApi();
const session = ref<AuthState | null>(null);
const sessionError = ref<string | null>(null);
const password = ref('');
const loginError = ref<string | null>(null);
const loggingIn = ref(false);

useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] });

watch(
    () => session.value?.authenticated,
    (authenticated) => {
        if (authenticated) emit('authenticated');
    }
);

onMounted(async () => {
    try {
        session.value = await api.session();
    } catch (error) {
        sessionError.value = errorMessage(error);
    }
});

async function login() {
    loggingIn.value = true;
    loginError.value = null;
    try {
        session.value = await api.login(password.value);
        password.value = '';
    } catch (error) {
        loginError.value = errorMessage(error);
    } finally {
        loggingIn.value = false;
    }
}

async function logout() {
    await api.logout().catch(() => undefined);
    session.value = await api.session();
}
</script>

<template>
    <div class="pc-admin">
        <header class="pc-admin-header">
            <div class="pc-admin-header__inner">
                <a v-if="api.config.adminRoute" :href="api.config.adminRoute" class="pc-admin-brand">PlayCanvas</a>
                <span v-if="title" class="pc-muted">/ {{ title }}</span>
                <span class="pc-spacer" />
                <slot v-if="session?.authenticated" name="actions" />
                <button
                    v-if="session?.authenticated && session.method === 'password'"
                    class="pc-button"
                    type="button"
                    @click="logout"
                >
                    Log out
                </button>
            </div>
        </header>

        <main class="pc-admin-main">
            <p v-if="sessionError" class="pc-alert">{{ sessionError }}</p>

            <p v-else-if="!session" class="pc-muted">Loading…</p>

            <section v-else-if="!session.configured" class="pc-card">
                <h2>The admin isn't set up</h2>
                <p>To manage PlayCanvas projects here, either:</p>
                <ul>
                    <li>
                        set an admin password in the
                        <code class="pc-code">NUXT_PLAYCANVAS_ADMIN_PASSWORD</code> environment variable, or
                    </li>
                    <li>
                        decide who has access with a <code class="pc-code">playcanvas:authorize</code> hook in a Nitro
                        plugin.
                    </li>
                </ul>
            </section>

            <section v-else-if="!session.authenticated && session.passwordLogin" class="pc-card pc-login">
                <h2>Log in</h2>
                <form @submit.prevent="login">
                    <label class="pc-field">
                        Admin password
                        <input
                            v-model="password"
                            class="pc-input"
                            type="password"
                            autocomplete="current-password"
                            required
                            autofocus
                        />
                    </label>
                    <p v-if="loginError" class="pc-alert">{{ loginError }}</p>
                    <button class="pc-button pc-button--primary" type="submit" :disabled="loggingIn || !password">
                        {{ loggingIn ? 'Logging in…' : 'Log in' }}
                    </button>
                </form>
            </section>

            <section v-else-if="!session.authenticated" class="pc-card">
                <h2>Access denied</h2>
                <p class="pc-muted">Your account doesn't have access to the PlayCanvas admin.</p>
            </section>

            <slot v-else />
        </main>
    </div>
</template>

<style src="./admin.css"></style>

<style scoped>
.pc-admin-header {
    background: var(--pc-surface);
    border-bottom: 1px solid var(--pc-border);
}

.pc-admin-header__inner {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 1080px;
    margin: 0 auto;
    padding: 12px 16px;
}

.pc-admin-brand {
    font-weight: 600;
    text-decoration: none;
}

.pc-login {
    max-width: 380px;
    margin: 48px auto;
}

.pc-login form {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.pc-login .pc-alert {
    margin: 0;
}
</style>
