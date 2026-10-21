import type { Application, RenderComponent } from 'playcanvas';
import { BoundingBox, Vec3, Mat4 } from 'playcanvas';
import type { SlotsType, VNode } from 'vue';
import { Fragment, Comment, defineComponent, h, onMounted, onUpdated, shallowRef, triggerRef } from 'vue';

import { useApp } from '../composables/use-app.ts';
import type { EntityExposed } from '../Entity.ts';
import { Entity } from '../Entity.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the existing component declaration
export interface AlignProps {
    left?: boolean;
    right?: boolean;
    top?: boolean;
    bottom?: boolean;
    front?: boolean;
    back?: boolean;
}

// Count rendered children, looking through fragments created by `v-for` and `<template>`
const countChildren = (vnodes: VNode[]): number =>
    vnodes.reduce((count, vnode) => {
        if (vnode.type === Comment) return count;
        if (vnode.type === Fragment) return count + countChildren(vnode.children as VNode[]);
        return count + 1;
    }, 0);

/**
 * Aligns its children by their combined bounds. By default the children are centered;
 * the flags align them to a side instead, eg `bottom` puts them on the ground plane.
 *
 * @example
 * <Align bottom>
 *   <Container :asset="asset" />
 * </Align>
 */
export const Align = defineComponent(
    (props: AlignProps, { slots }) => {
        const containerRef = shallowRef<EntityExposed | null>(null);
        const bounds = shallowRef(new BoundingBox(new Vec3(), new Vec3()));
        const app: Application = useApp();

        let childCount = 0;
        let measuredChildCount = -1;

        // all children should be part of the scene hierarchy now
        const measure = () => {
            measuredChildCount = childCount;

            const entity = containerRef.value?.entity;
            if (!app || !entity) return;

            const box = bounds.value;
            box.center.set(0, 0, 0);
            box.halfExtents.set(0.0, 0.0, 0.0);

            const tmpAABB: BoundingBox = new BoundingBox();
            const invWorldTransform: Mat4 = new Mat4();
            const renderComponents = entity.findComponents('render') as RenderComponent[];

            // Compute the bounds of all render components
            renderComponents.forEach((component) => {
                component.meshInstances.forEach((mi) => {
                    invWorldTransform.copy(mi.node.getWorldTransform()).invert();
                    tmpAABB.setFromTransformedAabb(mi.aabb, invWorldTransform);
                    box.add(mi.aabb);
                });
            });

            triggerRef(bounds);
        };

        onMounted(measure);
        // Re-measure only when the children change, as moving the container changes the world bounds
        onUpdated(() => {
            if (childCount !== measuredChildCount) measure();
        });

        return () => {
            const children = slots.default?.() ?? [];
            childCount = countChildren(children);

            const { center, halfExtents } = bounds.value;
            const { left, right, top, bottom, front, back } = props;

            // Align based on bounds and alignment flags
            const position: [number, number, number] = [
                left ? -center.x + halfExtents.x : right ? -center.x - halfExtents.x : -center.x,
                bottom ? -center.y + halfExtents.y : top ? -center.y - halfExtents.y : -center.y,
                front ? -center.z + halfExtents.z : back ? -center.z - halfExtents.z : -center.z
            ];

            return h(Entity, { ref: containerRef, position }, () => children);
        };
    },
    {
        name: 'Align',
        props: {
            left: Boolean,
            right: Boolean,
            top: Boolean,
            bottom: Boolean,
            front: Boolean,
            back: Boolean
        },
        slots: Object as SlotsType<{ default?: () => VNode[] }>
    }
);
