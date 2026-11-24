// Состояние, которое синхронизируется между устройствами, и его слияние.
// Правило одно: побеждает запись с более поздним временем; удаления помнятся отдельно («надгробия»).
import { CATS, COLORS, sanitizeAttrs, type Attrs } from './taxonomy';

export type ItemMeta = Attrs & {
	id: string;
	createdAt: number;
	updatedAt: number;
	/** Итого надето: wearBase (отметки до журнала) плюс дни из журнала. Пересчитывается после слияния. */
	wearCount: number;
	wearBase: number;
	/** Дата последней носки до журнала. */
	baseLast: number | null;
	lastWorn: number | null;
	origin: string;
	/** Фото лежит в хранилище под этим ключом. Новое фото — новый ключ. */
	photoKey: string;
};

/** То, что Мария хочет докупить. */
export type Wish = {
	id: string;
	title: string;
	category: string;
	/** Ключ цвета из taxonomy или пустая строка, если цвет не важен. */
	color: string;
	note: string;
	/** Скриншоты (до 6): каждый лежит в хранилище под своим ключом. Пусто — запись без картинок. */
	photoKeys: string[];
	createdAt: number;
	updatedAt: number;
};

/** Отметка «вещь надета в этот день». Ключ: «ГГГГ-ММ-ДД|id вещи». Включить и выключить можно сколько угодно раз. */
export type Mark = { on: boolean; at: number };

export type SyncState = {
	v: 1;
	items: Record<string, ItemMeta>;
	goneItems: Record<string, number>;
	marks: Record<string, Mark>;
	wishes: Record<string, Wish>;
	goneWishes: Record<string, number>;
	/** Категории, которые не нужно предлагать в «Дырах». */
	hidden: Record<string, Mark>;
};

export const emptyState = (): SyncState => ({ v: 1, items: {}, goneItems: {}, marks: {}, wishes: {}, goneWishes: {}, hidden: {} });
export const markKey = (date: string, id: string) => `${date}|${id}`;

function newest<T>(a: Record<string, T>, b: Record<string, T>, at: (t: T) => number): Record<string, T> {
	const out = { ...a };
	for (const [k, v] of Object.entries(b)) {
		const cur = out[k];
		if (!cur || at(v) > at(cur)) out[k] = v;
	}
	return out;
}
const latest = (a: Record<string, number>, b: Record<string, number>) => newest(a, b, (t) => t);

/** Слияние двух состояний: результат не зависит от порядка, повторное слияние ничего не меняет. */
export function mergeStates(a: SyncState, b: SyncState): SyncState {
	const goneItems = latest(a.goneItems, b.goneItems);
	const goneWishes = latest(a.goneWishes, b.goneWishes);
	const items = newest(a.items, b.items, (i) => i.updatedAt);
	for (const id of Object.keys(goneItems)) delete items[id];
	const wishes = newest(a.wishes, b.wishes, (w) => w.updatedAt);
	for (const id of Object.keys(goneWishes)) delete wishes[id];
	const marks = newest(a.marks, b.marks, (m) => m.at);
	// отметки удалённых вещей больше не нужны
	for (const k of Object.keys(marks)) if (goneItems[k.slice(11)] !== undefined) delete marks[k];
	return { v: 1, items, goneItems, marks, wishes, goneWishes, hidden: newest(a.hidden, b.hidden, (m) => m.at) };
}

// ---------- проверка чужих данных (сервер получает состояние из сети) ----------

const MAX = { items: 5000, marks: 200_000, wishes: 1000, hidden: 64, shots: 6 };
const ID = /^[\w-]{1,64}$/;
const PHOTO = /^[A-Za-z0-9-]{8,64}$/;
const MARK = /^\d{4}-\d{2}-\d{2}\|[\w-]{1,64}$/;
const catKeys = new Set(CATS.map((c) => c[0]));
const colorKeys = new Set(COLORS.map((c) => c[0]));

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const entries = (v: unknown, max: number): [string, unknown][] => {
	if (!isObj(v)) return [];
	const e = Object.entries(v);
	if (e.length > max) throw new Error('Слишком много записей');
	return e;
};
const times = (v: unknown, max: number) => {
	const out: Record<string, number> = {};
	for (const [k, t] of entries(v, max)) if (ID.test(k)) out[k] = num(t);
	return out;
};
const marks = (v: unknown, max: number, key: RegExp) => {
	const out: Record<string, Mark> = {};
	for (const [k, m] of entries(v, max)) {
		if (key.test(k) && isObj(m) && typeof m.on === 'boolean') out[k] = { on: m.on, at: num(m.at) };
	}
	return out;
};

/** Приводит присланное к SyncState; всё лишнее и некорректное отбрасывается. Бросает ошибку, если это вообще не состояние. */
export function parseState(raw: unknown): SyncState {
	if (!isObj(raw) || raw.v !== 1) throw new Error('Неизвестный формат данных');
	const out = emptyState();

	for (const [id, m] of entries(raw.items, MAX.items)) {
		if (!ID.test(id) || !isObj(m)) continue;
		const a = sanitizeAttrs(m);
		const photoKey = typeof m.photoKey === 'string' && PHOTO.test(m.photoKey) ? m.photoKey : '';
		if (!a.category || !photoKey) continue;
		out.items[id] = {
			id,
			name: a.name ?? '',
			brand: a.brand ?? '',
			category: a.category,
			colors: a.colors ?? [],
			material: a.material ?? '',
			seasons: a.seasons ?? [],
			formality: a.formality ?? 'casual',
			createdAt: num(m.createdAt),
			updatedAt: num(m.updatedAt),
			wearCount: num(m.wearCount),
			wearBase: num(m.wearBase),
			baseLast: numOrNull(m.baseLast),
			lastWorn: numOrNull(m.lastWorn),
			origin: text(m.origin, 200),
			photoKey
		};
	}
	out.goneItems = times(raw.goneItems, MAX.items * 2);
	out.marks = marks(raw.marks, MAX.marks, MARK);
	for (const [id, w] of entries(raw.wishes, MAX.wishes)) {
		if (!ID.test(id) || !isObj(w)) continue;
		const category = typeof w.category === 'string' && catKeys.has(w.category) ? w.category : '';
		const photoKeys = Array.isArray(w.photoKeys) ? [...new Set(w.photoKeys.filter((k): k is string => typeof k === 'string' && PHOTO.test(k)))].slice(0, MAX.shots) : [];
		// образ из скриншотов может быть без категории
		if (!category && !photoKeys.length) continue;
		out.wishes[id] = {
			id,
			title: text(w.title, 80),
			category,
			color: typeof w.color === 'string' && colorKeys.has(w.color) ? w.color : '',
			note: text(w.note, 160),
			photoKeys,
			createdAt: num(w.createdAt),
			updatedAt: num(w.updatedAt)
		};
	}
	out.goneWishes = times(raw.goneWishes, MAX.wishes * 2);
	const hidden = marks(raw.hidden, MAX.hidden, /^[a-z]{2,20}$/);
	for (const k of Object.keys(hidden)) if (catKeys.has(k)) out.hidden[k] = hidden[k];
	// уже удалённые не воскресают из присланного
	return mergeStates(emptyState(), out);
}
