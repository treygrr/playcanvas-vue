import type { Application, Entity } from 'playcanvas';
import type { InjectionKey } from 'vue';

import type { PhysicsContextType } from './physics.ts';

export const AppKey: InjectionKey<Application> = Symbol('pc-app');
export const ParentKey: InjectionKey<Entity> = Symbol('pc-parent');
export const PointerEventsKey: InjectionKey<Set<string>> = Symbol('pc-pointer-events');
export const PhysicsKey: InjectionKey<Readonly<PhysicsContextType>> = Symbol('pc-physics');
