import { ApiError, downloadPhoto, syncRequest, uploadPhoto } from './api.svelte';
import { wardrobe, type Item } from './store.svelte';
import { wishlist } from './wishlist.svelte';
import { applyState, photosToFetch, photosToUpload, sameLocal, toState, type Local } from './syncapply';
import { parseState } from './syncstate';

const ON_KEY = 'wardrobe-sync';
const LAST_KEY = 'wardrobe-sync-last';
const POOL = 3;

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error' | 'unconfigured';

/** Простейший пул: выполняет задачи по несколько штук сразу. */
async function pool<T>(list: T[], run: (x: T) => Promise<void>) {
	const queue = [...list];
	await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, async () => {
		for (let x = queue.shift(); x !== undefined; x = queue.shift()) await run(x);
	}));
}

const snapshot = (): Local<Blob> => ({
	items: wardrobe.items,
	log: wardrobe.log,
	marks: wardrobe.marks,
	goneItems: wardrobe.goneItems,
	wishes: wishlist.wishes,
	goneWishes: wishlist.goneWishes,
	hidden: wishlist.hiddenMarks
});

class Sync {
	enabled = $state(localStorage.getItem(ON_KEY) === '1');
	status = $state<SyncStatus>(localStorage.getItem(ON_KEY) === '1' ? 'idle' : 'off');
	message = $state('');
	/** Что происходит сейчас, например «Загружаю фото 3 из 12». */
	progress = $state('');
	last = $state<number | null>(Number(localStorage.getItem(LAST_KEY)) || null);
	#running = false;
	#again = false;
	#timer: ReturnType<typeof setTimeout> | undefined;

	enable() {
		localStorage.setItem(ON_KEY, '1');
		this.enabled = true;
		this.status = 'idle';
		return this.run();
	}

	disable() {
		localStorage.removeItem(ON_KEY);
		clearTimeout(this.#timer);
		this.enabled = false;
		this.status = 'off';
		this.message = '';
	}

	/** Правка на устройстве: отправим через пару секунд, чтобы не слать каждое нажатие. */
	touch() {
		if (!this.enabled || this.status === 'unconfigured') return;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.run(), 3000);
	}

	async run() {
		if (!this.enabled || !wardrobe.loaded || !wishlist.loaded) return;
		if (this.#running) {
			this.#again = true;
			return;
		}
		this.#running = true;
		this.status = 'syncing';
		this.message = '';
		try {
			do {
				this.#again = false;
				await this.#once();
			} while (this.#again);
			this.last = Date.now();
			localStorage.setItem(LAST_KEY, String(this.last));
			this.status = 'ok';
		} catch (e) {
			if (e instanceof ApiError && e.status === 501) {
				this.status = 'unconfigured';
				this.message = 'На сервере не подключено хранилище Vercel Blob. Инструкция в README, раздел «Синхронизация».';
			} else if (e instanceof ApiError && e.status === 401) {
				this.status = 'error';
				this.message = 'Нужен код доступа.';
			} else {
				this.status = 'error';
				this.message = e instanceof Error ? e.message : 'Не получилось синхронизировать';
			}
		} finally {
			this.#running = false;
			this.progress = '';
		}
	}

	async #once() {
		const revs = [wardrobe.rev, wishlist.rev];
		// 1. отправляем своё и получаем общее состояние
		const reply = await syncRequest(toState(snapshot()));
		const remote = parseState(reply.state);

		// 2. догружаем на сервер недостающие фото своих вещей
		const up = photosToUpload(snapshot(), reply.photos);
		let done = 0;
		await pool(up, async (i) => {
			this.progress = `Загружаю фото: ${++done} из ${up.length}`;
			await uploadPhoto(i.photoKey, i.photo);
		});

		// 3. скачиваем фото вещей, которых нет на этом устройстве. Если фото ещё нет на сервере (другое устройство не успело) — вещь придёт в следующий раз
		const need = photosToFetch(snapshot(), remote).filter((k) => reply.photos.includes(k) || up.some((i) => i.photoKey === k));
		const photos = new Map<string, Blob>();
		done = 0;
		await pool(need, async (key) => {
			this.progress = `Скачиваю фото: ${++done} из ${need.length}`;
			try {
				photos.set(key, await downloadPhoto(key));
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) throw e;
			}
		});

		// 4. применяем к тому, что на устройстве сейчас (оно могло измениться, пока шёл обмен)
		const before = snapshot();
		const after = applyState(before, remote, photos);
		if (!sameLocal(before, after) || after.items.some((i, n) => i.photo !== before.items[n]?.photo)) {
			await wardrobe.replace(after.items as Item[], after.log, after.marks, after.goneItems);
			await wishlist.replace(after.wishes, after.hidden, after.goneWishes);
		}
		// пока шёл обмен, пользователь успел что-то поменять: нужен ещё круг, чтобы это тоже ушло на сервер
		if (wardrobe.rev !== revs[0] || wishlist.rev !== revs[1]) this.#again = true;
	}
}

export const sync = new Sync();
