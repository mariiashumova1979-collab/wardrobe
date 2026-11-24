import { describe, expect, it } from 'vitest';
import { emptyState, mergeStates, type ItemMeta, type SyncState } from '../syncstate';
import { PHOTO_KEY, syncState } from './sync';
import type { SyncStore } from './syncstore';

const item = (id: string, o: Partial<ItemMeta> = {}): ItemMeta => ({
	id, name: id, brand: '', category: 'top', colors: [], material: '', seasons: [], formality: 'casual',
	createdAt: 1, updatedAt: 1, wearCount: 0, wearBase: 0, baseLast: null, lastWorn: null, origin: '', photoKey: 'photo-' + id + '-0000', ...o
});
const st = (o: Partial<SyncState>): SyncState => ({ ...emptyState(), ...o });

/** Хранилище в памяти, которое умеет «опередить» запись, как это сделало бы другое устройство. */
function memory(initial?: string) {
	let text = initial ?? null;
	let version = 0;
	const log: string[] = [];
	let interfere: (() => void) | null = null;
	const store: SyncStore = {
		async readState() {
			return text === null ? null : { text, etag: 'v' + version };
		},
		async writeState(t, etag) {
			interfere?.();
			interfere = null;
			const cur = text === null ? null : 'v' + version;
			log.push(cur === etag ? 'write' : 'conflict');
			if (cur !== etag) return false;
			text = t;
			version++;
			return true;
		},
		async listPhotos() {
			return [];
		},
		async writePhoto() {},
		async readPhoto() {
			return null;
		}
	};
	return { store, log, get text() { return text; }, onNextWrite: (f: () => void) => (interfere = f), set: (t: string) => { text = t; version++; } };
}

describe('сервер синхронизации', () => {
	it('первая запись создаёт состояние, повторная без изменений ничего не пишет', async () => {
		const m = memory();
		const s = st({ items: { a: item('a') } });
		expect((await syncState(m.store, s)).items.a).toBeTruthy();
		expect(m.log).toEqual(['write']);
		await syncState(m.store, s);
		await syncState(m.store, null);
		expect(m.log).toEqual(['write']);
	});
	it('устройства дополняют друг друга', async () => {
		const m = memory();
		await syncState(m.store, st({ items: { a: item('a') } }));
		const second = await syncState(m.store, st({ items: { b: item('b') } }));
		expect(Object.keys(second.items).sort()).toEqual(['a', 'b']);
		expect(Object.keys((await syncState(m.store, null)).items).sort()).toEqual(['a', 'b']);
	});
	it('если другое устройство успело записать раньше, правки не теряются', async () => {
		const m = memory(JSON.stringify(st({ items: { a: item('a') } })));
		m.onNextWrite(() => m.set(JSON.stringify(mergeStates(st({ items: { a: item('a') } }), st({ items: { c: item('c') } })))));
		const res = await syncState(m.store, st({ items: { b: item('b') } }));
		expect(Object.keys(res.items).sort()).toEqual(['a', 'b', 'c']);
		expect(m.log).toEqual(['conflict', 'write']);
		expect(Object.keys(JSON.parse(m.text!).items).sort()).toEqual(['a', 'b', 'c']);
	});
	it('без конца проигрывая гонку, сдаётся с понятной ошибкой', async () => {
		const m = memory(JSON.stringify(st({ items: { a: item('a') } })));
		const store: SyncStore = { ...m.store, writeState: async () => false };
		await expect(syncState(store, st({ items: { b: item('b') } }))).rejects.toThrow(/одновременных/);
	});
	it('повреждённый файл не затирается', async () => {
		const m = memory('{ не json');
		await expect(syncState(m.store, st({}))).rejects.toThrow();
		expect(m.log).toEqual([]);
		expect(m.text).toBe('{ не json');
	});
	it('ключи фото проверяются', () => {
		expect(PHOTO_KEY.test('3f2b9c1e-aaaa-4bbb-8ccc-123456789abc')).toBe(true);
		for (const bad of ['', 'short', '../etc/passwd', 'a/b/c/d/e/f/g/h', 'x'.repeat(65)]) expect(PHOTO_KEY.test(bad)).toBe(false);
	});
});
