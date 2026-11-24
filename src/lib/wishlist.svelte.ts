import { get, set } from 'idb-keyval';
import type { Mark, Wish as WishMeta } from './syncstate';

/** Желание со скриншотами: photos[i] — картинка для photoKeys[i]. */
export type Wish = WishMeta & { photos: Blob[] };

const KEY = 'wardrobe-wishlist-v2';
const OLD_KEY = 'wardrobe-wishlist-v1';
type Saved = { wishes: Wish[]; hidden: Record<string, Mark>; goneWishes: Record<string, number> };

class Wishlist {
	wishes = $state.raw<Wish[]>([]);
	/** Отметки «эту категорию не предлагать»; отметку можно снять, поэтому хранится время. */
	hiddenMarks = $state.raw<Record<string, Mark>>({});
	goneWishes = $state.raw<Record<string, number>>({});
	/** Категории, которые не нужно предлагать. */
	hidden = $derived(Object.entries(this.hiddenMarks).filter(([, m]) => m.on).map(([c]) => c));
	rev = $state(0);
	loaded = $state(false);
	error = $state('');

	async load() {
		if (this.loaded) return;
		try {
			const s = await get<Saved>(KEY);
			if (s) {
				this.wishes = s.wishes.map((w) => ({ ...w, photoKeys: w.photoKeys ?? [], photos: w.photos ?? [] }));
				this.hiddenMarks = s.hidden;
				this.goneWishes = s.goneWishes;
			} else {
				// список из прошлой версии: до синхронизации у желаний не было времени правки
				const old = await get<{ wishes?: (Omit<Wish, 'updatedAt' | 'photoKeys' | 'photos'> & { updatedAt?: number })[]; hidden?: string[] }>(OLD_KEY);
				this.wishes = (old?.wishes ?? []).map((w) => ({ ...w, updatedAt: w.updatedAt ?? w.createdAt, photoKeys: [], photos: [] }));
				this.hiddenMarks = Object.fromEntries((old?.hidden ?? []).map((c) => [c, { on: true, at: 1 }]));
				this.goneWishes = {};
			}
		} catch {
			this.error = 'Не удалось открыть список желаемого.';
		}
		this.loaded = true;
	}

	async #save(wishes: Wish[], hidden: Record<string, Mark>, gone: Record<string, number>) {
		await set(KEY, { wishes, hidden, goneWishes: gone } satisfies Saved);
		this.wishes = wishes;
		this.hiddenMarks = hidden;
		this.goneWishes = gone;
	}

	async #commit(wishes: Wish[], hidden = this.hiddenMarks, gone = this.goneWishes) {
		await this.#save(wishes, hidden, gone);
		this.rev++;
	}

	/** Ключ нового скриншота: старый ключ не переиспользуем, потому что картинка по ключу неизменна. */
	#withKeys(w: Wish, prev?: Wish): Wish {
		const keys = w.photos.map((p) => {
			const i = prev ? prev.photos.indexOf(p) : -1;
			return i >= 0 ? prev!.photoKeys[i] : crypto.randomUUID();
		});
		return { ...w, photoKeys: keys };
	}
	add(w: Omit<Wish, 'id' | 'createdAt' | 'updatedAt' | 'photoKeys'>) {
		const now = Date.now();
		const full = this.#withKeys({ ...w, id: crypto.randomUUID(), photoKeys: [], createdAt: now, updatedAt: now });
		return this.#commit([full, ...this.wishes]);
	}
	update(w: Omit<Wish, 'photoKeys'> & { photoKeys?: string[] }) {
		const prev = this.wishes.find((x) => x.id === w.id);
		if (!prev) return Promise.resolve();
		const next = { ...this.#withKeys({ ...w, photoKeys: [] }, prev), updatedAt: Date.now() };
		return this.#commit(this.wishes.map((x) => (x.id === w.id ? next : x)));
	}
	remove(id: string) {
		return this.#commit(
			this.wishes.filter((x) => x.id !== id),
			this.hiddenMarks,
			{ ...this.goneWishes, [id]: Date.now() }
		);
	}
	hide(category: string) {
		return this.#commit(this.wishes, { ...this.hiddenMarks, [category]: { on: true, at: Date.now() } });
	}
	unhide(category: string) {
		return this.#commit(this.wishes, { ...this.hiddenMarks, [category]: { on: false, at: Date.now() } });
	}

	/** Синхронизация приносит готовое состояние. Не увеличивает `rev`. */
	replace(wishes: Wish[], hidden: Record<string, Mark>, gone: Record<string, number>) {
		return this.#save(wishes, hidden, gone);
	}
}

export const wishlist = new Wishlist();
