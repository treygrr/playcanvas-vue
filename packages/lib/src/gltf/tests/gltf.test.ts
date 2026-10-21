import type { Entity as PcEntity } from 'playcanvas';
import { Application as PcApplication, NullGraphicsDevice } from 'playcanvas';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import { createLightingScene, createSimpleRobot } from '../../../test/fixtures/gltf-hierarchies.ts';
import { mountScene, settle } from '../../../test/mount.ts';
import { createMockGltfAsset } from '../../../test/utils/gltf-asset-mock.ts';
import { findEntityByName } from '../../../test/utils/gltf-entity-builder.ts';
import { Light } from '../../components/Light.ts';
import { Entity } from '../../Entity.ts';
import { Gltf } from '../components/Gltf.ts';
import { Modify } from '../components/Modify.ts';
import { useEntity } from '../composables/use-entity.ts';

describe('Gltf', () => {
    let fixtureApp: PcApplication;

    beforeEach(() => {
        const canvas = document.createElement('canvas');
        fixtureApp = new PcApplication(canvas, { graphicsDevice: new NullGraphicsDevice(canvas) });
    });

    it('adds the instantiated hierarchy to the parent', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        const { app } = await mountScene(() => h(Gltf, { asset: createMockGltfAsset(hierarchy) }));

        expect(hierarchy.parent).toBe(app.root);
    });

    it('does not add the hierarchy to the scene when render is false', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        await mountScene(() => h(Gltf, { asset: createMockGltfAsset(hierarchy), render: false }));

        expect(hierarchy.parent).toBeNull();
    });

    it('removes components with the `<Modify.Light remove />` shorthand', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        // A bare attribute in a template is passed as an empty string
        const shorthand = { remove: '' } as never;
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                h(Modify.Node, { path: 'RootNode.Body.Head' }, () => h(Modify.Light, shorthand))
            )
        );

        expect(findEntityByName(hierarchy, 'Head')!.light).toBeFalsy();
        expect(findEntityByName(hierarchy, 'Head')!.render).toBeTruthy();
    });

    it('modifies components with values and functional updates', async () => {
        const hierarchy = createLightingScene(fixtureApp);
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () => [
                h(Modify.Node, { path: '**.KeyLight' }, () => h(Modify.Light, { intensity: (v: number) => v * 2 })),
                h(Modify.Node, { path: '**.RimLight' }, () => h(Modify.Light, { color: 'red' }))
            ])
        );

        expect(findEntityByName(hierarchy, 'KeyLight')!.light!.intensity).toBe(4);
        expect(findEntityByName(hierarchy, 'RimLight')!.light!.color.toArray()).toEqual([1, 0, 0, 1]);
    });

    it('re-applies functional updates from the original value when the rule changes', async () => {
        const hierarchy = createLightingScene(fixtureApp);
        const factor = ref(2);
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                h(Modify.Node, { path: '**.KeyLight' }, () =>
                    h(Modify.Light, { intensity: (v: number) => v * factor.value })
                )
            )
        );
        expect(findEntityByName(hierarchy, 'KeyLight')!.light!.intensity).toBe(4);

        factor.value = 3;
        await settle();

        expect(findEntityByName(hierarchy, 'KeyLight')!.light!.intensity).toBe(6);
    });

    it('applies a rule to every entity matched by a component filter', async () => {
        const hierarchy = createLightingScene(fixtureApp);
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                h(Modify.Node, { path: '**[light]' }, () => h(Modify.Light, { remove: true }))
            )
        );

        for (const name of ['KeyLight', 'FillLight', 'RimLight', 'Spot1', 'Spot2']) {
            expect(findEntityByName(hierarchy, name)!.light).toBeFalsy();
        }
    });

    it('adds children to matched entities, and clears original children', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                h(Modify.Node, { path: 'RootNode.Body', clearChildren: true }, () => h(Entity, { name: 'Added' }))
            )
        );

        const body = findEntityByName(hierarchy, 'Body')!;
        expect(body.children.map((c) => c.name)).toEqual(['Added']);
    });

    it('removes added children when the rule is unmounted', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        const show = ref(true);
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                show.value ? h(Modify.Node, { path: 'RootNode.Body.Head' }, () => h(Entity, { name: 'Hat' })) : null
            )
        );
        expect(findEntityByName(hierarchy, 'Hat')).toBeTruthy();

        show.value = false;
        await settle();

        expect(findEntityByName(hierarchy, 'Hat')).toBeNull();
    });

    it('supports predicate paths', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                h(Modify.Node, { path: (entity: PcEntity) => entity.name.endsWith('Arm') }, () =>
                    h(Modify.Render, { remove: true })
                )
            )
        );

        expect(findEntityByName(hierarchy, 'LeftArm')!.render).toBeFalsy();
        expect(findEntityByName(hierarchy, 'RightArm')!.render).toBeFalsy();
        expect(findEntityByName(hierarchy, 'Body')!.render).toBeTruthy();
    });

    it('lets the most specific rule win a conflict', async () => {
        const hierarchy = createLightingScene(fixtureApp);
        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () => [
                h(Modify.Node, { path: '**[light]' }, () => h(Modify.Light, { intensity: 10 })),
                h(Modify.Node, { path: 'LightingRig.MainLights.KeyLight' }, () => h(Modify.Light, { intensity: 20 }))
            ])
        );

        expect(findEntityByName(hierarchy, 'KeyLight')!.light!.intensity).toBe(20);
        expect(findEntityByName(hierarchy, 'FillLight')!.light!.intensity).toBe(10);
    });

    it('finds entities relative to the parent with useEntity', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        let found: unknown = null;

        const Finder = defineComponent(() => {
            const children = useEntity('*');
            return () => {
                found = children.value;
                return null;
            };
        });

        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                h(Modify.Node, { path: 'RootNode.Body' }, () => h(Finder))
            )
        );

        expect((found as PcEntity[]).map((e) => e.name)).toEqual(['Head', 'LeftArm', 'RightArm']);
    });

    it('warns when adding a component the entity already has', async () => {
        const hierarchy = createSimpleRobot(fixtureApp);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await mountScene(() =>
            h(Gltf, { asset: createMockGltfAsset(hierarchy) }, () =>
                h(Modify.Node, { path: 'RootNode.Body.Head' }, () => h(Light))
            )
        );
        // Warnings are logged asynchronously
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(warn).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.stringContaining('Cannot add <Light> component')
        );
        warn.mockRestore();
    });
});
