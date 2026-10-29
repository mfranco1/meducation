import { progressKey } from './progressCodec';
import { flashcardProgressKey } from './flashcardProgressCodec';

export const startedKey = 'meducation.started.v1';

/** True once the visitor chose Start studying, or already has saved quiz or flashcard progress. */
export function hasStartedStudying(storage: Pick<Storage, 'getItem'> = localStorage): boolean { try { return [startedKey, progressKey, flashcardProgressKey].some(key => storage.getItem(key) !== null); } catch { return false; } }

export function markStartedStudying(storage: Pick<Storage, 'setItem'> = localStorage): void { try { storage.setItem(startedKey, '1'); } catch { /* Entering the app does not depend on remembering it. */ } }
