import { get, set } from 'idb-keyval';
import type { Attrs } from './taxonomy';

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

class Wardrobe {
	items = $state.raw<Item[]>([]);
	loaded = $state(false);
	error = $state('');
	#urls = new Map<string, string>();

	async load() {
		if (this.loaded) return;
		try {
			this.items = ((await get<Item[]>(KEY)) ?? []).map((i) => ({ ...i, brand: i.brand ?? '' }));
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

	async #commit(next: Item[]) {
		await set(KEY, next);
		this.items = next;
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
		return this.#commit(this.items.filter((i) => i.id !== id));
	}
}

export const wardrobe = new Wardrobe();
