import { onScopeDispose } from 'vue';

import { useApp } from './use-app.ts';

/**
 * Base event callback map for PlayCanvas application events.
 * This can be extended to include custom events.
 */
export type BaseEventCallbackMap = {
    /**
     * @param dt - The delta time since the last frame
     * @returns void
     */
    update: (dt: number) => void;
    /**
     * @returns void
     */
    prerender: () => void;
    /**
     * @returns void
     */
    postrender: () => void;
};

/**
 * Generic composable for subscribing to PlayCanvas application events.
 * Supports both built-in events and custom events with proper TypeScript typing.
 * The listener is removed when the calling component unmounts.
 *
 * @param event - The event name to subscribe to
 * @param callback - The callback function to execute when the event fires
 *
 * @example
 * ```ts
 * // Built-in events with type safety
 * useAppEvent('update', (dt) => console.log('Frame time:', dt));
 * useAppEvent('prerender', () => console.log('Pre-render'));
 * useAppEvent('postrender', () => console.log('Post-render'));
 * ```
 *
 * @example
 * ```ts
 * // Custom events with a custom event map
 * interface MyEventMap {
 *   levelComplete: (level: number, score: number) => void;
 *   playerDeath: (position: [number, number, number]) => void;
 * }
 *
 * useAppEvent<MyEventMap>('levelComplete', (level, score) => {
 *   console.log(`Level ${level} completed with score ${score}`);
 * });
 * ```
 */
export function useAppEvent<TEventMap = BaseEventCallbackMap, TEventName extends keyof TEventMap = keyof TEventMap>(
    event: TEventName,
    callback: TEventMap[TEventName]
): void {
    const app = useApp();

    const handler = (...args: unknown[]) => {
        (callback as (...args: unknown[]) => void)(...args);
    };

    app.on(event as string, handler);
    onScopeDispose(() => {
        app.off(event as string, handler);
    });
}
