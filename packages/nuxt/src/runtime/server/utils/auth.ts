import type { H3Event } from 'h3';

import {
    createError,
    getHeader,
    getRequestIP,
    getRequestProtocol,
    useNitroApp,
    useRuntimeConfig,
    useSession
} from '#imports';

import { timingSafeEqual } from './records';

/**
 * Passed to `playcanvas:authorize` hooks. Set `allowed` to decide whether the request may use the
 * admin; leave it undefined to fall back to the admin password.
 *
 * @example
 * // server/plugins/playcanvas-auth.ts
 * export default defineNitroPlugin((nitroApp) => {
 *     nitroApp.hooks.hook('playcanvas:authorize', async (event, auth) => {
 *         const user = await getUserFromSession(event);
 *         auth.allowed = user?.role === 'admin';
 *     });
 * });
 */
export type AuthorizeContext = { allowed?: boolean };

export type AuthState = {
    /** Whether this request may use the admin */
    authenticated: boolean;
    /** How it was decided */
    method: 'hook' | 'password' | null;
    /** Whether the built-in password login is available */
    passwordLogin: boolean;
    /** Whether any way to log in is set up */
    configured: boolean;
};

type AdminConfig = { adminPassword?: string; sessionSecret?: string };

type AdminSession = { admin?: boolean };

const sessionDays = 7;

const adminConfig = () => useRuntimeConfig().playcanvas as AdminConfig;

/** The key sessions are sealed with. Derived from the password unless set, so changing it signs everyone out */
async function sessionPassword(config: AdminConfig): Promise<string> {
    if (config.sessionSecret && config.sessionSecret.length >= 32) return config.sessionSecret;
    const data = new TextEncoder().encode(`playcanvas-admin:${config.adminPassword}`);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function useAdminSession(event: H3Event) {
    const { baseURL } = useRuntimeConfig().public.playcanvas as { baseURL: string };

    return useSession<AdminSession>(event, {
        name: 'playcanvas-admin',
        password: await sessionPassword(adminConfig()),
        maxAge: sessionDays * 24 * 60 * 60,
        // Only sent to the admin API, never to the rest of the site
        cookie: {
            httpOnly: true,
            sameSite: 'strict',
            secure: getRequestProtocol(event) === 'https',
            path: `${baseURL}/api/admin`
        },
        sessionHeader: false
    });
}

/** Asks `playcanvas:authorize` hooks, then the password session, whether this request may use the admin */
export async function getAuthState(event: H3Event): Promise<AuthState> {
    const config = adminConfig();
    const passwordLogin = Boolean(config.adminPassword);

    const context: AuthorizeContext = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom hook, typed by the module's declaration
    await (useNitroApp().hooks as any).callHook('playcanvas:authorize', event, context);
    if (context.allowed !== undefined) {
        return { authenticated: context.allowed, method: 'hook', passwordLogin, configured: true };
    }

    if (!passwordLogin) return { authenticated: false, method: null, passwordLogin, configured: false };

    const session = await useAdminSession(event);
    return { authenticated: session.data.admin === true, method: 'password', passwordLogin, configured: true };
}

/**
 * Throws unless the request may use the admin. Requests that change something must also send the
 * `x-playcanvas-admin` header: browsers don't send custom headers cross-site without a CORS preflight,
 * so other sites can't act through a logged-in admin's browser.
 */
export async function requireAdmin(event: H3Event): Promise<AuthState> {
    if (event.method !== 'GET' && getHeader(event, 'x-playcanvas-admin') !== '1') {
        throw createError({ statusCode: 403, statusMessage: 'Missing x-playcanvas-admin header' });
    }

    const state = await getAuthState(event);
    if (!state.configured) {
        throw createError({
            statusCode: 403,
            statusMessage:
                'The PlayCanvas admin is disabled. Set NUXT_PLAYCANVAS_ADMIN_PASSWORD, or add a playcanvas:authorize hook.'
        });
    }
    if (!state.authenticated) throw createError({ statusCode: 401, statusMessage: 'Not logged in' });
    return state;
}

// Login attempts per IP, to slow down password guessing
const attempts = new Map<string, { count: number; resetAt: number }>();
const maxAttempts = 10;
const attemptWindowMs = 15 * 60_000;

/** Checks a password login, rate limited per IP. Resolves true when the password is right */
export async function checkPasswordLogin(event: H3Event, password: unknown): Promise<boolean> {
    const { adminPassword } = adminConfig();
    if (!adminPassword) throw createError({ statusCode: 403, statusMessage: 'Password login is not enabled' });

    const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
    const now = Date.now();
    const record = attempts.get(ip);
    if (record && record.resetAt > now && record.count >= maxAttempts) {
        throw createError({ statusCode: 429, statusMessage: 'Too many login attempts. Try again later.' });
    }

    const valid = typeof password === 'string' && timingSafeEqual(password, adminPassword);
    if (valid) {
        attempts.delete(ip);
        return true;
    }

    attempts.set(ip, {
        count: record && record.resetAt > now ? record.count + 1 : 1,
        resetAt: record && record.resetAt > now ? record.resetAt : now + attemptWindowMs
    });
    // Slow every failure down
    await new Promise((resolve) => setTimeout(resolve, 500));
    return false;
}
