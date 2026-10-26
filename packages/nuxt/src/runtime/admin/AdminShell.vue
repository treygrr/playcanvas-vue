<script setup lang="ts">
/**
 * The admin's frame, after the Nuxt UI dashboard template: a sidebar with every project, search (⌘K), and a gate
 * that only renders the page once the visitor is logged in.
 */
import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui';
import { computed, onMounted, ref, watch } from 'vue';

import { useHead } from '#imports';

import type { AuthState } from './api';
import { errorMessage, projectStatus, useAdminApi, useAdminProjects } from './api';

defineSlots<{ default?: () => unknown }>();

/** Emitted once the visitor is logged in, so pages only load data they have access to */
const emit = defineEmits<{ authenticated: [] }>();

const api = useAdminApi();
const { projects, refresh } = useAdminProjects();
const session = ref<AuthState | null>(null);
const sessionError = ref<string | null>(null);
const password = ref('');
const loginError = ref<string | null>(null);
const loggingIn = ref(false);
const sidebarOpen = ref(false);

useHead({ title: 'PlayCanvas admin', meta: [{ name: 'robots', content: 'noindex, nofollow' }] });

watch(
    () => session.value?.authenticated,
    (authenticated) => {
        if (!authenticated) return;
        emit('authenticated');
        if (!projects.value) refresh().catch(() => undefined);
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
    projects.value = null;
    session.value = await api.session();
}

const close = () => {
    sidebarOpen.value = false;
};

const home = api.config.adminRoute;
const projectLink = (slug: string) => `${home}/manage/${slug}`;

const links = computed<NavigationMenuItem[][]>(() => [
    [{ label: 'Projects', icon: 'i-lucide-layout-grid', to: home, exact: true, onSelect: close }],
    (projects.value ?? []).map((project) => ({
        label: project.title,
        icon: 'i-lucide-box',
        to: projectLink(project.slug),
        // A dot for projects visitors can't play
        chip: projectStatus(project).color === 'success' ? undefined : { color: projectStatus(project).color },
        onSelect: close
    })),
    [
        { label: 'Back to site', icon: 'i-lucide-arrow-left', to: '/' },
        ...(session.value?.method === 'password'
            ? [{ label: 'Log out', icon: 'i-lucide-log-out', onSelect: logout }]
            : [])
    ]
]);

const groups = computed<CommandPaletteGroup[]>(() => [
    {
        id: 'actions',
        label: 'Actions',
        items: [{ label: 'Add a project', icon: 'i-lucide-plus', to: `${home}?add=1` }]
    },
    {
        id: 'projects',
        label: 'Projects',
        items: (projects.value ?? []).map((project) => ({
            label: project.title,
            suffix: `/${project.slug}`,
            icon: 'i-lucide-box',
            to: projectLink(project.slug)
        }))
    }
]);
</script>

<template>
    <UDashboardGroup v-if="session?.authenticated" unit="rem">
        <UDashboardSidebar
            id="playcanvas-admin"
            v-model:open="sidebarOpen"
            collapsible
            resizable
            class="bg-elevated/25"
            :ui="{ footer: 'lg:border-t lg:border-default' }"
        >
            <template #header="{ collapsed }">
                <ULink
                    :to="home"
                    class="flex items-center gap-2.5 min-w-0 rounded-md px-1.5 py-1.5 hover:bg-elevated/50"
                >
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-inverted">
                        <UIcon name="i-lucide-box" class="size-5" />
                    </span>
                    <span v-if="!collapsed" class="min-w-0 leading-tight">
                        <span class="block truncate font-semibold text-highlighted">PlayCanvas</span>
                        <span class="block text-xs text-muted">Admin</span>
                    </span>
                </ULink>
            </template>

            <template #default="{ collapsed }">
                <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

                <UNavigationMenu :collapsed="collapsed" :items="links[0]" orientation="vertical" tooltip />

                <template v-if="links[1]?.length">
                    <p v-if="!collapsed" class="px-2.5 pt-2 text-xs font-medium text-dimmed">Your projects</p>
                    <UNavigationMenu :collapsed="collapsed" :items="links[1]" orientation="vertical" tooltip />
                </template>

                <UNavigationMenu
                    :collapsed="collapsed"
                    :items="links[2]"
                    orientation="vertical"
                    tooltip
                    class="mt-auto"
                />
            </template>

            <template #footer="{ collapsed }">
                <div class="flex w-full items-center gap-2" :class="collapsed ? 'justify-center' : 'justify-between'">
                    <span v-if="!collapsed" class="truncate text-xs text-muted">Appearance</span>
                    <UColorModeButton color="neutral" variant="ghost" size="sm" />
                </div>
            </template>
        </UDashboardSidebar>

        <UDashboardSearch :groups="groups" placeholder="Search projects…" />

        <slot />
    </UDashboardGroup>

    <!-- Everything before logging in: one centered card -->
    <div v-else class="fixed inset-0 grid place-items-center overflow-auto bg-default p-4">
        <div class="w-full max-w-sm">
            <div class="mb-6 flex items-center justify-center gap-2.5">
                <span class="grid size-9 place-items-center rounded-lg bg-primary text-inverted">
                    <UIcon name="i-lucide-box" class="size-5" />
                </span>
                <span class="text-lg font-semibold text-highlighted">PlayCanvas admin</span>
            </div>

            <UAlert
                v-if="sessionError"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                title="Couldn't reach the admin"
                :description="sessionError"
            />

            <UPageCard v-else-if="!session" variant="subtle">
                <USkeleton class="h-5 w-32" />
                <USkeleton class="h-9 w-full" />
            </UPageCard>

            <UPageCard
                v-else-if="!session.configured"
                variant="subtle"
                icon="i-lucide-settings"
                title="The admin isn't set up"
                description="Choose how people log in to it."
            >
                <ul class="space-y-3 text-sm text-muted">
                    <li>
                        Set an admin password in the
                        <code class="font-mono text-highlighted">NUXT_PLAYCANVAS_ADMIN_PASSWORD</code> environment
                        variable.
                    </li>
                    <li>
                        Or decide who has access yourself, with a
                        <code class="font-mono text-highlighted">playcanvas:authorize</code> hook in a Nitro plugin.
                    </li>
                </ul>
            </UPageCard>

            <UPageCard
                v-else-if="session.passwordLogin"
                variant="subtle"
                title="Log in"
                description="Enter the admin password to manage your PlayCanvas projects."
            >
                <form class="space-y-4" @submit.prevent="login">
                    <UFormField label="Admin password" :error="loginError ?? undefined">
                        <UInput
                            v-model="password"
                            type="password"
                            autocomplete="current-password"
                            required
                            autofocus
                            class="w-full"
                        />
                    </UFormField>
                    <UButton type="submit" label="Log in" block :loading="loggingIn" :disabled="!password" />
                </form>
            </UPageCard>

            <UPageCard
                v-else
                variant="subtle"
                icon="i-lucide-lock"
                title="No access"
                description="Your account can't use the PlayCanvas admin. Ask an admin to give you access."
            >
                <UButton to="/" label="Back to site" icon="i-lucide-arrow-left" color="neutral" variant="outline" />
            </UPageCard>
        </div>
    </div>
</template>
