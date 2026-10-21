import type { CameraComponent, GraphNode } from 'playcanvas';
import { Gizmo as PcGizmo, RotateGizmo, ScaleGizmo, TransformGizmo, TranslateGizmo } from 'playcanvas';
import type { PropType } from 'vue';
import { defineComponent, shallowRef, toRaw, watch } from 'vue';

import { useApp } from '../composables/use-app.ts';

type Mode = 'rotate' | 'scale' | 'translate';

export type GizmoEntityProps = {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public prop declaration
export interface GizmoProps {
    /**
     * The camera component to use for the gizmo.
     */
    camera: CameraComponent;
    /**
     * The nodes to attach the gizmo to.
     */
    nodes: GraphNode[];
    /**
     * The mode of the gizmo.
     */
    mode: Mode;
}

/**
 * A gizmo component that allows you to manipulate the nodes in the scene.
 * Emits `commit` with the updated transforms when a manipulation ends.
 *
 * @example
 * <Gizmo :camera="camera" :nodes="nodes" mode="rotate" @commit="onCommit" />
 */
export const Gizmo = defineComponent(
    (props: GizmoProps, { emit }) => {
        const app = useApp();
        const layer = PcGizmo.createLayer(app);
        const gizmo = shallowRef<RotateGizmo | ScaleGizmo | TranslateGizmo | null>(null);

        const onGizmoCommit = () => {
            const updated = toRaw(props.nodes).map((node) => ({
                id: node.name,
                position: node.getPosition().toArray(),
                rotation: node.getEulerAngles().toArray(),
                scale: node.getLocalScale().toArray()
            })) as GizmoEntityProps[];
            emit('commit', updated);
        };

        watch(
            [() => props.camera, () => props.mode],
            ([camera, mode], _prev, onCleanup) => {
                const GizmoType = { rotate: RotateGizmo, scale: ScaleGizmo, translate: TranslateGizmo }[mode];
                const instance = new GizmoType(toRaw(camera), layer);
                instance.on(TransformGizmo.EVENT_TRANSFORMEND, onGizmoCommit);
                gizmo.value = instance;

                onCleanup(() => {
                    instance.destroy?.();
                    gizmo.value = null;
                });
            },
            { immediate: true }
        );

        watch(
            [() => props.nodes, gizmo],
            ([nodes, instance]) => {
                instance?.attach(toRaw(nodes));
            },
            { immediate: true }
        );

        return () => null;
    },
    {
        name: 'Gizmo',
        props: {
            camera: { type: Object as PropType<CameraComponent>, required: true },
            nodes: { type: Array as PropType<GraphNode[]>, required: true },
            mode: { type: String as PropType<Mode>, required: true }
        },
        emits: {
            commit: (updated: GizmoEntityProps[]) => Array.isArray(updated)
        }
    }
);
