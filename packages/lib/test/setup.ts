import type * as playcanvas from 'playcanvas';
import { vi } from 'vitest';

/**
 * The engine can't create a WebGL or WebGPU device in jsdom, so every application is
 * created with a Null graphics device.
 */
vi.mock('playcanvas', async () => {
    const actual = await vi.importActual<typeof playcanvas>('playcanvas');

    const MockApplication = vi.fn(function MockApplication(this: unknown, target: unknown) {
        // Schema generation passes a plain object stub for a canvas
        const canvas = target instanceof HTMLCanvasElement ? target : document.createElement('canvas');
        return new actual.Application(canvas, {
            graphicsDevice: new actual.NullGraphicsDevice(canvas),
            touch: new actual.TouchDevice(canvas),
            mouse: new actual.Mouse(canvas)
        });
    });

    return {
        ...actual,
        Application: MockApplication
    };
});

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn(function MockResizeObserver() {
    return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn()
    };
}) as unknown as typeof ResizeObserver;
