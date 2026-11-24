import { get, setMany } from 'idb-keyval';
import type { Attrs } from './taxonomy';
import { applyDay, dropFromLog, type WearLog } from './wearlog';

export type Item = Attrs & {
	id: string;
	photo: Blob;
	createdAt: number;
	wearCount: number;
	lastWorn: number | null;
	/** Откуда фото: запрос в поиске или «своё». */
	origin: string;
};

const KEY = 'wardrobe-items-v1';
const LOG_KEY = 'wardrobe-wear-v1';

class Wardrobe {
	items = $state.raw<Item[]>([]);
	/** Журнал носки: «ГГГГ-ММ-ДД» → id надетых вещей. */
	log = $state.raw<WearLog>({});
	loaded = $state(false);
	error = $state('');
	#urls = new Map<string, string>();

	async load() {
		if (this.loaded) return;
		try {
			const [items, log] = await Promise.all([get<Item[]>(KEY), get<WearLog>(LOG_KEY)]);
			this.items = (items ?? []).map((i) => ({ ...i, brand: i.brand ?? '' }));
			this.log = log ?? {};
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

	// Вещи и журнал пишутся одной транзакцией: счётчики носки не разойдутся с датами
	async #commit(next: Item[], log: WearLog = this.log) {
		await setMany([
			[KEY, next],
			[LOG_KEY, log]
		]);
		this.items = next;
		this.log = log;
	}

	add(item: Item) {
		return this.#commit([item, ...this.items]);
	}

	update(item: Item) {
		const prev = this.items.find((i) => i.id === item.id);
		if (prev && prev.photo !== item.photo) this.#forget(item.id);
		return this.#commit(this.items.map((i) => (i.id === item.id ? item : i)));
	}

	remove(id: string) {
		this.#forget(id);
		return this.#commit(
			this.items.filter((i) => i.id !== id),
			dropFromLog(this.log, id)
		);
	}

	/** Записывает, что в этот день надето ровно это. */
	setDay(date: string, ids: string[]) {
		const r = applyDay(this.items, this.log, date, ids);
		return this.#commit(r.items, r.log);
	}

	/** Добавляет вещи к тому, что уже отмечено в этот день. */
	logWear(date: string, ids: string[]) {
		return this.setDay(date, [...(this.log[date] ?? []), ...ids]);
	}
}

export const wardrobe = new Wardrobe();
