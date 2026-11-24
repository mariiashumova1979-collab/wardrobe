import { get, setMany } from 'idb-keyval';
import { applyDay, dropFromLog, logToMarks, type WearLog } from './wearlog';
import type { ItemMeta, Mark } from './syncstate';

export type Item = ItemMeta & { photo: Blob };
/** То, что задаёт форма добавления; служебные поля для синхронизации ставит хранилище. */
export type NewItem = Omit<Item, 'updatedAt' | 'photoKey' | 'wearBase' | 'baseLast'>;

const KEY = 'wardrobe-items-v1';
const LOG_KEY = 'wardrobe-wear-v1';
const META_KEY = 'wardrobe-meta-v1';
type Meta = { marks: Record<string, Mark>; goneItems: Record<string, number> };

const sameAttrs = (a: Item, b: Item) =>
	a.name === b.name &&
	a.brand === b.brand &&
	a.category === b.category &&
	a.material === b.material &&
	a.formality === b.formality &&
	a.origin === b.origin &&
	JSON.stringify(a.colors) === JSON.stringify(b.colors) &&
	JSON.stringify(a.seasons) === JSON.stringify(b.seasons);

class Wardrobe {
	items = $state.raw<Item[]>([]);
	/** Журнал носки: «ГГГГ-ММ-ДД» → id надетых вещей. */
	log = $state.raw<WearLog>({});
	/** Для синхронизации: кто и когда включал и снимал отметки, и какие вещи удалены. */
	marks = $state.raw<Record<string, Mark>>({});
	goneItems = $state.raw<Record<string, number>>({});
	/** Растёт при каждом изменении: по нему приложение понимает, что пора синхронизироваться. */
	rev = $state(0);
	loaded = $state(false);
	error = $state('');
	#urls = new Map<string, string>();

	async load() {
		if (this.loaded) return;
		try {
			const [items, log, meta] = await Promise.all([get<Item[]>(KEY), get<WearLog>(LOG_KEY), get<Meta>(META_KEY)]);
			const saved = log ?? {};
			const count = new Map<string, number>();
			for (const ids of Object.values(saved)) for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
			let migrated = false;
			// вещи, сохранённые до синхронизации, получают ключ фото и «базу» носки (то, что надето не по журналу)
			const list = (items ?? []).map((i) => {
				const old = i as Partial<Item> & Item;
				if (old.photoKey) return { ...old, brand: old.brand ?? '' };
				migrated = true;
				return {
					...old,
					brand: old.brand ?? '',
					updatedAt: old.createdAt,
					photoKey: crypto.randomUUID(),
					wearBase: Math.max(0, old.wearCount - (count.get(old.id) ?? 0)),
					baseLast: count.has(old.id) ? null : old.lastWorn
				} satisfies Item;
			});
			const marks = logToMarks(saved, meta?.marks ?? {});
			if (Object.keys(marks).length !== Object.keys(meta?.marks ?? {}).length) migrated = true;
			this.items = list;
			this.log = saved;
			this.marks = marks;
			this.goneItems = meta?.goneItems ?? {};
			if (migrated) await this.#save(list, saved, marks, this.goneItems);
			// просим браузер не вычищать данные при нехватке места
			await navigator.storage?.persist?.();
		} catch {
			this.error = 'Не удалось открыть хранилище браузера: вещи не сохранятся.';
		}
		this.loaded = true;
	}

	url(item: Item): string {
		let u = this.#urls.get(item.id);
		if (!u) {
			u = URL.createObjectURL(item.photo);
			this.#urls.set(item.id, u);
		}
		return u;
	}

	#forget(id: string) {
		const u = this.#urls.get(id);
		if (u) URL.revokeObjectURL(u);
		this.#urls.delete(id);
	}

	#save(items: Item[], log: WearLog, marks: Record<string, Mark>, gone: Record<string, number>) {
		// одной транзакцией: счётчики носки, отметки и вещи не разойдутся
		return setMany([
			[KEY, items],
			[LOG_KEY, log],
			[META_KEY, { marks, goneItems: gone } satisfies Meta]
		]);
	}

	async #commit(next: Item[], log = this.log, marks = this.marks, gone = this.goneItems) {
		await this.#save(next, log, marks, gone);
		this.items = next;
		this.log = log;
		this.marks = marks;
		this.goneItems = gone;
		this.rev++;
	}

	add(item: NewItem) {
		const full: Item = { ...item, updatedAt: Date.now(), photoKey: crypto.randomUUID(), wearBase: 0, baseLast: null };
		return this.#commit([full, ...this.items]);
	}

	update(item: Item) {
		const prev = this.items.find((i) => i.id === item.id);
		if (!prev) return Promise.resolve();
		const photoChanged = prev.photo !== item.photo;
		if (!photoChanged && sameAttrs(prev, item)) return Promise.resolve();
		if (photoChanged) this.#forget(item.id);
		const next: Item = { ...item, updatedAt: Date.now(), photoKey: photoChanged ? crypto.randomUUID() : prev.photoKey };
		return this.#commit(this.items.map((i) => (i.id === item.id ? next : i)));
	}

	remove(id: string) {
		this.#forget(id);
		const marks = Object.fromEntries(Object.entries(this.marks).filter(([k]) => k.slice(11) !== id));
		return this.#commit(
			this.items.filter((i) => i.id !== id),
			dropFromLog(this.log, id),
			marks,
			{ ...this.goneItems, [id]: Date.now() }
		);
	}

	/** Записывает, что в этот день надето ровно это. */
	setDay(date: string, ids: string[]) {
		const r = applyDay(this.items, this.log, date, ids);
		if (!Object.keys(r.marks).length) return Promise.resolve();
		return this.#commit(r.items, r.log, { ...this.marks, ...r.marks });
	}

	/** Добавляет вещи к тому, что уже отмечено в этот день. */
	logWear(date: string, ids: string[]) {
		return this.setDay(date, [...(this.log[date] ?? []), ...ids]);
	}

	/** Синхронизация приносит готовое состояние целиком. Не увеличивает `rev`: это не правка пользователя. */
	async replace(items: Item[], log: WearLog, marks: Record<string, Mark>, gone: Record<string, number>) {
		for (const old of this.items) {
			const now = items.find((i) => i.id === old.id);
			if (!now || now.photo !== old.photo) this.#forget(old.id);
		}
		await this.#save(items, log, marks, gone);
		this.items = items;
		this.log = log;
		this.marks = marks;
		this.goneItems = gone;
	}
}

export const wardrobe = new Wardrobe();
