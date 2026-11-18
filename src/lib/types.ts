import type { Attrs } from './taxonomy';

/** Редактируемая копия вещи: пока человек правит поля, в хранилище ничего не меняется. */
export type Draft = Attrs & { wearCount: number };
export type TagStatus = 'idle' | 'tagging' | 'done' | 'failed';
