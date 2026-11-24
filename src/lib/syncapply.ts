// Перенос между локальными данными устройства и общим состоянием. Чистые функции: фото передаются как есть, поэтому тестируются без браузера.
import { marksToLog, reconcileWear, type WearLog } from './wearlog';
import { mergeStates, type ItemMeta, type Mark, type SyncState, type Wish } from './syncstate';

export type LocalItem<P> = ItemMeta & { photo: P };

export type Local<P> = {
	items: LocalItem<P>[];
	log: WearLog;
	marks: Record<string, Mark>;
	goneItems: Record<string, number>;
	wishes: Wish[];
	goneWishes: Record<string, number>;
	hidden: Record<string, Mark>;
};

/** Метаданные вещи без фото: то, что уходит в общее состояние. */
export function itemMeta<P>(i: LocalItem<P>): ItemMeta {
	const { photo: _photo, ...meta } = i;
	return meta;
}

export function toState<P>(l: Local<P>): SyncState {
	return {
		v: 1,
		items: Object.fromEntries(l.items.map((i) => [i.id, itemMeta(i)])),
		goneItems: l.goneItems,
		marks: l.marks,
		wishes: Object.fromEntries(l.wishes.map((w) => [w.id, w])),
		goneWishes: l.goneWishes,
		hidden: l.hidden
	};
}

/** Ключи фото, которых нет на этом устройстве, но они нужны вещам из слияния. */
export function photosToFetch<P>(l: Local<P>, remote: SyncState): string[] {
	const merged = mergeStates(toState(l), remote);
	const have = new Map(l.items.map((i) => [i.id, i.photoKey]));
	const need = new Set<string>();
	for (const m of Object.values(merged.items)) if (have.get(m.id) !== m.photoKey) need.add(m.photoKey);
	return [...need];
}

/** Ключи фото своих вещей, которых ещё нет в хранилище. */
export function photosToUpload<P>(l: Local<P>, stored: string[]): LocalItem<P>[] {
	const has = new Set(stored);
	return l.items.filter((i) => !has.has(i.photoKey));
}

/**
 * Применяет общее состояние к локальным данным. Сливаем с тем, что на устройстве сейчас, а не с тем, что было в начале синхронизации,
 * поэтому правки, сделанные во время обмена с сервером, не теряются. Вещь, чьё новое фото ещё не скачано, остаётся прежней до следующего раза.
 */
export function applyState<P>(local: Local<P>, remote: SyncState, photos: Map<string, P>): Local<P> {
	const m = mergeStates(toState(local), remote);
	const mine = new Map(local.items.map((i) => [i.id, i]));
	const items: LocalItem<P>[] = [];
	for (const meta of Object.values(m.items)) {
		const cur = mine.get(meta.id);
		if (cur && cur.photoKey === meta.photoKey) items.push({ ...meta, photo: cur.photo });
		else if (photos.has(meta.photoKey)) items.push({ ...meta, photo: photos.get(meta.photoKey)! });
		else if (cur) items.push(cur);
	}
	items.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
	const log = marksToLog(m.marks, new Set(items.map((i) => i.id)));
	return {
		items: reconcileWear(items, log),
		log,
		marks: m.marks,
		goneItems: m.goneItems,
		wishes: Object.values(m.wishes).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)),
		goneWishes: m.goneWishes,
		hidden: m.hidden
	};
}

/** Одинаковы ли два состояния устройства (фото сравниваются по ключам). */
export const sameLocal = <P>(a: Local<P>, b: Local<P>) => JSON.stringify(toState(a)) === JSON.stringify(toState(b));
