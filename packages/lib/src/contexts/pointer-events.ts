import { inject } from 'vue';

import { PointerEventsKey } from './keys.ts';

export const usePointerEventsContext = () => {
    const context = inject(PointerEventsKey, null);
    if (context === null) {
        throw new Error('usePointerEventsContext must be used within an <Application/> component');
    }
    return context;
};
