import type { AppBase, CameraComponent, Entity, GraphNode } from 'playcanvas';
import { Picker } from 'playcanvas';

import { SyntheticMouseEvent, SyntheticPointerEvent } from './synthetic-event.ts';

// Utility to propagate events up the entity hierarchy
const propagateEvent = (
    entity: Entity,
    event: SyntheticPointerEvent | SyntheticMouseEvent,
    stopAt: Entity | null = null
): boolean => {
    while (entity) {
        if (entity === stopAt) return false;
        entity.fire(event.type, event);
        if (event.hasStoppedPropagation) return true;
        entity = entity.parent as Entity;
    }
    return false;
};

const getNearestCommonAncestor = (a: GraphNode | null, b: GraphNode | null): GraphNode | null => {
    const ancestors = new Set<GraphNode>();

    // Traverse up the parent chain of entity 'a' and add each ancestor to the set
    let current: GraphNode | null = a;
    while (current) {
        ancestors.add(current);
        current = current.parent;
    }

    // Traverse up the parent chain of entity 'b' and check against the set
    current = b;
    while (current) {
        if (ancestors.has(current)) {
            return current; // Found the nearest common ancestor
        }
        current = current.parent;
    }

    return null; // No common ancestor found
};

const getEntityAtPointerEvent = async (
    app: AppBase,
    picker: Picker,
    rect: DOMRect,
    e: MouseEvent
): Promise<Entity | null> => {
    // Find the highest priority camera
    const [activeCamera]: CameraComponent[] = (app.root.findComponents('camera') as CameraComponent[])
        .filter((camera: CameraComponent) => !camera.renderTarget)
        .sort((a: CameraComponent, b: CameraComponent) => a.priority - b.priority);

    if (!activeCamera) return null;

    // Get canvas bounds
    const canvas = app.graphicsDevice.canvas;

    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;

    // Calculate position relative to canvas
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ignore events outside the canvas bounds to avoid unnecessary picker work
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        return null;
    }

    // Scale calculation using PlayCanvas's DPR
    const scaleX = canvas.width / (rect.width * app.graphicsDevice.maxPixelRatio);
    const scaleY = canvas.height / (rect.height * app.graphicsDevice.maxPixelRatio);

    // prepare the picker and perform picking
    try {
        picker.prepare(activeCamera, app.scene);
        const [meshInstance] = await picker.getSelectionAsync(x * scaleX, y * scaleY);
        if (!meshInstance) return null;

        // Gaussian splats are picked as their component, meshes as their mesh instance
        return ('node' in meshInstance ? meshInstance.node : meshInstance.entity) as Entity;
    } catch {
        // The picker can fail if the camera is not active or the canvas is not visible
        return null;
    }
};

/**
 * Dispatches pointer events from `el` to the entities under the pointer. Entities opt in by adding
 * their GUID to `pointerEvents`; while the set is empty, no picking work is done.
 *
 * @param app The application to pick from.
 * @param el The element to listen on, usually the application canvas.
 * @param pointerEvents The GUIDs of entities that have pointer event listeners.
 * @returns A function that removes all listeners.
 */
export const createPicker = (app: AppBase, el: HTMLElement, pointerEvents: Set<string>): (() => void) => {
    let activeEntity: Entity | null = null;
    let pointerDetails: PointerEvent | null = null;
    let canvasRect: DOMRect | null = app.graphicsDevice.canvas.getBoundingClientRect();

    // Construct a Global Picker
    const picker = new Picker(app, app.graphicsDevice.width, app.graphicsDevice.height);

    // Watch for the canvas to resize. Necessary for correct picking
    const resizeObserver = new ResizeObserver(() => {
        canvasRect = app.graphicsDevice?.canvas?.getBoundingClientRect() ?? null;
        if (canvasRect) {
            picker.resize(canvasRect.width, canvasRect.height);
        }
    });

    if (app.graphicsDevice?.canvas) resizeObserver.observe(app.graphicsDevice.canvas);

    // Store pointer position
    const onPointerMove = (e: PointerEvent) => {
        pointerDetails = e;
    };

    const onFrameUpdate = async () => {
        if (pointerEvents.size === 0) {
            // No listeners: clear hover state to avoid stale pointerout on re-enable
            activeEntity = null;
            return;
        }

        const e: PointerEvent | null = pointerDetails;
        if (!e || !canvasRect) return;

        const entity = await getEntityAtPointerEvent(app, picker, canvasRect, e);

        const prevEntity = activeEntity;

        // Find the common ancestor of the current target and last event. We do not need to bubble past this
        const stopBubblingAt: Entity | null = getNearestCommonAncestor(prevEntity, entity) as Entity;

        // If the pointer moves out of the current hovered entity (and its children)
        if (prevEntity && prevEntity !== entity) {
            const pointerOutEvent = new SyntheticPointerEvent(e);
            pointerOutEvent.type = 'pointerout';
            propagateEvent(prevEntity, pointerOutEvent, stopBubblingAt);
        }

        // If the pointer moves over a new entity
        if (entity && entity !== prevEntity) {
            const pointerOverEvent = new SyntheticPointerEvent(e);
            pointerOverEvent.type = 'pointerover';
            propagateEvent(entity, pointerOverEvent, stopBubblingAt);
        }

        // Update our reference
        activeEntity = entity;
    };

    // Construct a generic handler for pointer events
    const onInteractionEvent = async (e: MouseEvent) => {
        if (!canvasRect || pointerEvents.size === 0) return;

        const entity = await getEntityAtPointerEvent(app, picker, canvasRect, e);

        if (!entity) return;

        // Handle other pointer events (down, up, move)
        const syntheticEvent = e instanceof PointerEvent ? new SyntheticPointerEvent(e) : new SyntheticMouseEvent(e);

        propagateEvent(entity, syntheticEvent);
    };

    el.addEventListener('pointerup', onInteractionEvent);
    el.addEventListener('pointerdown', onInteractionEvent);
    el.addEventListener('mouseup', onInteractionEvent);
    el.addEventListener('click', onInteractionEvent);
    el.addEventListener('pointermove', onPointerMove);
    app.on('update', onFrameUpdate);

    return () => {
        resizeObserver.disconnect();
        el.removeEventListener('pointerup', onInteractionEvent);
        el.removeEventListener('pointerdown', onInteractionEvent);
        el.removeEventListener('mouseup', onInteractionEvent);
        el.removeEventListener('click', onInteractionEvent);
        el.removeEventListener('pointermove', onPointerMove);
        app.off('update', onFrameUpdate);
    };
};
