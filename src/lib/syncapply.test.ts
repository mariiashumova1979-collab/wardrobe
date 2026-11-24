import { describe, expect, it } from 'vitest';
import { applyState, itemMeta, photosToFetch, photosToUpload, sameLocal, toState, type Local, type LocalItem } from './syncapply';
import { applyDay } from './wearlog';
import { emptyState, mergeStates, type SyncState } from './syncstate';

const item = (id: string, o: Partial<LocalItem<string>> = {}): LocalItem<string> => ({
	id, name: id, brand: '', category: 'top', colors: ['white'], material: '', seasons: [], formality: 'casual',
	createdAt: 1, updatedAt: 1, wearCount: 0, wearBase: 0, baseLast: null, lastWorn: null, origin: '',
	photoKey: 'photo-' + id + '-0000', photo: 'blob:' + id, ...o
});
const empty = (): Local<string> => ({ items: [], log: {}, marks: {}, goneItems: {}, wishes: [], goneWishes: {}, hidden: {} });
const withItems = (...items: LocalItem<string>[]): Local<string> => ({ ...empty(), items });

/** «Устройство»: пара «локальные данные ↔ общий сервер» с теми же шагами, что делает приложение. */
function sync(local: Local<string>, server: SyncState, photosOnServer: Record<string, string>) {
	const merged = mergeStates(server, toState(local));
	for (const i of photosToUpload(local, Object.keys(photosOnServer))) photosOnServer[i.photoKey] = i.photo;
	const fetched = new Map<string, string>();
	for (const k of photosToFetch(local, merged)) if (photosOnServer[k]) fetched.set(k, photosOnServer[k]);
	return { local: applyState(local, merged, fetched), server: merged };
}

describe('устройства обмениваются данными', () => {
	it('вещь с телефона появляется на компьютере вместе с фото', () => {
		const photos: Record<string, string> = {};
		let server = emptyState();
		const phone = sync(withItems(item('a', { photo: 'фото-a' })), server, photos);
		server = phone.server;
		const pc = sync(empty(), server, photos);
		expect(pc.local.items.map((i) => [i.id, i.photo])).toEqual([['a', 'фото-a']]);
	});
	it('удаление на одном устройстве убирает вещь и на другом', () => {
		const photos: Record<string, string> = {};
		let a = sync(withItems(item('x'), item('y')), emptyState(), photos);
		let b = sync(empty(), a.server, photos);
		expect(b.local.items).toHaveLength(2);
		const removed: Local<string> = { ...a.local, items: a.local.items.filter((i) => i.id !== 'x'), goneItems: { x: 50 } };
		a = sync(removed, b.server, photos);
		b = sync(b.local, a.server, photos);
		expect(b.local.items.map((i) => i.id)).toEqual(['y']);
	});
	it('носка с двух устройств складывается и счётчики пересчитываются', () => {
		const photos: Record<string, string> = {};
		const base = sync(withItems(item('a'), item('b')), emptyState(), photos);
		const phone = sync(empty(), base.server, photos).local;
		const pc = base.local;
		const d1 = applyDay(phone.items, phone.log, '2026-11-20', ['a'], 100);
		const d2 = applyDay(pc.items, pc.log, '2026-11-21', ['a', 'b'], 200);
		const p = sync({ ...phone, items: d1.items, log: d1.log, marks: { ...phone.marks, ...d1.marks } }, base.server, photos);
		const c = sync({ ...pc, items: d2.items, log: d2.log, marks: { ...pc.marks, ...d2.marks } }, p.server, photos);
		const p2 = sync(p.local, c.server, photos);
		for (const dev of [c.local, p2.local]) {
			expect(dev.log).toEqual({ '2026-11-20': ['a'], '2026-11-21': ['a', 'b'] });
			expect(dev.items.find((i) => i.id === 'a')).toMatchObject({ wearCount: 2 });
			expect(dev.items.find((i) => i.id === 'b')).toMatchObject({ wearCount: 1 });
		}
	});
	it('снятая отметка с другого устройства снимается и здесь', () => {
		const photos: Record<string, string> = {};
		const base = sync(withItems(item('a')), emptyState(), photos);
		const marked = applyDay(base.local.items, base.local.log, '2026-11-20', ['a'], 100);
		const a = sync({ ...base.local, items: marked.items, log: marked.log, marks: marked.marks }, base.server, photos);
		const b = sync(empty(), a.server, photos);
		const un = applyDay(b.local.items, b.local.log, '2026-11-20', [], 300);
		const b2 = sync({ ...b.local, items: un.items, log: un.log, marks: { ...b.local.marks, ...un.marks } }, b.server, photos);
		const a2 = sync(a.local, b2.server, photos);
		expect(a2.local.log).toEqual({});
		expect(a2.local.items[0].wearCount).toBe(0);
	});
	it('правки сделанные во время обмена не теряются', () => {
		const photos: Record<string, string> = {};
		const s = sync(withItems(item('a')), emptyState(), photos);
		// пока шёл запрос, на устройстве переименовали вещь (updatedAt новее, чем в ответе сервера)
		const edited = withItems(item('a', { name: 'новое имя', updatedAt: 99 }));
		const after = applyState(edited, s.server, new Map());
		expect(after.items[0].name).toBe('новое имя');
	});
	it('вещь, чьё новое фото ещё не скачано, не пропадает и не ломается', () => {
		const old = withItems(item('a', { photo: 'старое', photoKey: 'photo-a-old0000' }));
		const remote: SyncState = { ...emptyState(), items: { a: itemMeta(item('a', { name: 'свежее', updatedAt: 9, photoKey: 'photo-a-new0000' })) } };
		expect(photosToFetch(old, remote)).toEqual(['photo-a-new0000']);
		const without = applyState(old, remote, new Map());
		expect(without.items[0]).toMatchObject({ name: 'a', photo: 'старое' });
		const withIt = applyState(old, remote, new Map([['photo-a-new0000', 'новое']]));
		expect(withIt.items[0]).toMatchObject({ name: 'свежее', photo: 'новое' });
	});
	it('вещь без фото на сервере не появляется, пока фото не загружено', () => {
		const remote: SyncState = { ...emptyState(), items: { z: itemMeta(item('z')) } };
		expect(applyState(empty(), remote, new Map()).items).toEqual([]);
	});
	it('повторное применение ничего не меняет', () => {
		const photos: Record<string, string> = {};
		const a = sync(withItems(item('a'), item('b')), emptyState(), photos);
		const again = sync(a.local, a.server, photos);
		expect(sameLocal(a.local, again.local)).toBe(true);
	});
	it('список желаемого и скрытые категории переезжают', () => {
		const photos: Record<string, string> = {};
		const a = sync({ ...empty(), wishes: [{ id: 'w', title: 'туфли', category: 'shoes', color: '', note: '', createdAt: 1, updatedAt: 1 }], hidden: { bag: { on: true, at: 5 } } }, emptyState(), photos);
		const b = sync(empty(), a.server, photos);
		expect(b.local.wishes.map((w) => w.title)).toEqual(['туфли']);
		expect(b.local.hidden.bag.on).toBe(true);
	});
});
