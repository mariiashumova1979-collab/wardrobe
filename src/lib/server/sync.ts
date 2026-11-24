import { emptyState, mergeStates, parseState, type SyncState } from '../syncstate';
import type { SyncStore } from './syncstore';

const ATTEMPTS = 6;

/**
 * Читает состояние и, если прислано своё, сливает его с хранимым и записывает.
 * Запись условная (по etag): если другое устройство успело записать раньше, читаем заново и сливаем ещё раз.
 */
export async function syncState(store: SyncStore, incoming: SyncState | null): Promise<SyncState> {
	for (let i = 0; i < ATTEMPTS; i++) {
		const cur = await store.readState();
		// Повреждённый файл не затираем молча: лучше ошибка, чем потерянный гардероб
		const base = cur ? parseState(JSON.parse(cur.text)) : emptyState();
		if (!incoming) return base;
		const merged = mergeStates(base, incoming);
		const text = JSON.stringify(merged);
		if (cur && text === JSON.stringify(base)) return merged;
		if (await store.writeState(text, cur?.etag ?? null)) return merged;
	}
	throw new Error('Слишком много одновременных изменений, попробуй ещё раз');
}

export const PHOTO_KEY = /^[A-Za-z0-9-]{8,64}$/;
export const PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_PHOTO = 3 * 1024 * 1024;
export const MAX_STATE = 4 * 1024 * 1024;
