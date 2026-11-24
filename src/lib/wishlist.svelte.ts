import { get, set } from 'idb-keyval';

/** То, что Мария сама хочет докупить: показывается в «Дырах» рядом с подсказками. */
export type Wish = {
	id: string;
	title: string;
	category: string;
	/** Ключ цвета из taxonomy или пустая строка, если цвет не важен. */
	color: string;
	note: string;
	createdAt: number;
};

const KEY = 'wardrobe-wishlist-v1';
type Saved = { wishes: Wish[]; hidden: string[] };

class Wishlist {
	wishes = $state.raw<Wish[]>([]);
	/** Категории, которые не нужно предлагать. */
	hidden = $state.raw<string[]>([]);
	loaded = $state(false);
	error = $state('');

	async load() {
		if (this.loaded) return;
		try {
			const s = await get<Saved>(KEY);
			this.wishes = s?.wishes ?? [];
			this.hidden = s?.hidden ?? [];
		} catch {
			this.error = 'Не удалось открыть список желаемого.';
		}
		this.loaded = true;
	}

	async #commit(wishes: Wish[], hidden: string[]) {
		await set(KEY, { wishes, hidden } satisfies Saved);
		this.wishes = wishes;
		this.hidden = hidden;
	}

	add(w: Omit<Wish, 'id' | 'createdAt'>) {
		return this.#commit([{ ...w, id: crypto.randomUUID(), createdAt: Date.now() }, ...this.wishes], this.hidden);
	}
	update(w: Wish) {
		return this.#commit(
			this.wishes.map((x) => (x.id === w.id ? w : x)),
			this.hidden
		);
	}
	remove(id: string) {
		return this.#commit(
			this.wishes.filter((x) => x.id !== id),
			this.hidden
		);
	}
	hide(category: string) {
		return this.#commit(this.wishes, [...new Set([...this.hidden, category])]);
	}
	unhide(category: string) {
		return this.#commit(
			this.wishes,
			this.hidden.filter((c) => c !== category)
		);
	}
}

export const wishlist = new Wishlist();
