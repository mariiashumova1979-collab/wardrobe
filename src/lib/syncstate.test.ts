import { describe, expect, it } from 'vitest';
import { applyDay, logToMarks, marksToLog, reconcileWear } from './wearlog';
import { emptyState, markKey, mergeStates, parseState, type ItemMeta, type SyncState, type Wish } from './syncstate';

const item = (id: string, o: Partial<ItemMeta> = {}): ItemMeta => ({
	id,
	name: id,
	brand: '',
	category: 'top',
	colors: ['white'],
	material: '',
	seasons: [],
	formality: 'casual',
	createdAt: 1,
	updatedAt: 1,
	wearCount: 0,
	wearBase: 0,
	baseLast: null,
	lastWorn: null,
	origin: '',
	photoKey: 'photo-' + id + '-0000',
	...o
});
const wish = (id: string, o: Partial<Wish> = {}): Wish => ({ id, title: id, category: 'shoes', color: '', note: '', createdAt: 1, updatedAt: 1, ...o });
const state = (o: Partial<SyncState> = {}): SyncState => ({ ...emptyState(), ...o });

describe('слияние состояний', () => {
	it('новая правка побеждает, при равном времени остаётся первая', () => {
		const a = state({ items: { x: item('x', { name: 'старое', updatedAt: 1 }) } });
		const b = state({ items: { x: item('x', { name: 'новое', updatedAt: 5 }) } });
		expect(mergeStates(a, b).items.x.name).toBe('новое');
		expect(mergeStates(b, a).items.x.name).toBe('новое');
		const c = state({ items: { x: item('x', { name: 'другое', updatedAt: 1 }) } });
		expect(mergeStates(a, c).items.x.name).toBe('старое');
	});
	it('вещи с разных устройств складываются', () => {
		const m = mergeStates(state({ items: { a: item('a') } }), state({ items: { b: item('b') } }));
		expect(Object.keys(m.items).sort()).toEqual(['a', 'b']);
	});
	it('удаление распространяется и не отменяется старой копией', () => {
		const phone = state({ items: { a: item('a') }, marks: { [markKey('2026-11-20', 'a')]: { on: true, at: 5 } } });
		const laptop = state({ goneItems: { a: 10 } });
		const m = mergeStates(phone, laptop);
		expect(m.items.a).toBeUndefined();
		expect(Object.keys(m.marks)).toEqual([]);
		expect(mergeStates(m, phone).items.a).toBeUndefined();
	});
	it('желания: правка, удаление, скрытые категории', () => {
		const a = state({ wishes: { w: wish('w', { title: 'до', updatedAt: 1 }) }, hidden: { pants: { on: true, at: 1 } } });
		const b = state({ wishes: { w: wish('w', { title: 'после', updatedAt: 2 }) }, hidden: { pants: { on: false, at: 3 } } });
		const m = mergeStates(a, b);
		expect(m.wishes.w.title).toBe('после');
		expect(m.hidden.pants.on).toBe(false);
		expect(mergeStates(m, state({ goneWishes: { w: 9 } })).wishes.w).toBeUndefined();
	});
	it('слияние коммутативно и идемпотентно', () => {
		const a = state({
			items: { a: item('a', { updatedAt: 3 }), c: item('c', { name: 'A', updatedAt: 2 }) },
			marks: { [markKey('2026-11-20', 'a')]: { on: true, at: 4 } },
			goneItems: { z: 2 }
		});
		const b = state({
			items: { b: item('b'), c: item('c', { name: 'B', updatedAt: 7 }) },
			marks: { [markKey('2026-11-20', 'a')]: { on: false, at: 6 }, [markKey('2026-11-21', 'b')]: { on: true, at: 1 } },
			goneItems: { y: 1 }
		});
		const ab = mergeStates(a, b);
		expect(mergeStates(b, a)).toEqual(ab);
		expect(mergeStates(ab, ab)).toEqual(ab);
		expect(mergeStates(ab, a)).toEqual(ab);
	});
});

describe('журнал при слиянии', () => {
	it('отметки с двух устройств за один день складываются, а не затирают друг друга', () => {
		const items = [item('a'), item('b')];
		const phone = applyDay(items, {}, '2026-11-24', ['a'], 100);
		const laptop = applyDay(items, {}, '2026-11-24', ['b'], 200);
		const m = mergeStates(state({ marks: phone.marks }), state({ marks: laptop.marks }));
		expect(marksToLog(m.marks, new Set(['a', 'b']))).toEqual({ '2026-11-24': ['a', 'b'] });
	});
	it('снятая позже отметка побеждает, поставленная позже возвращает вещь', () => {
		const items = [item('a')];
		const on = applyDay(items, {}, '2026-11-24', ['a'], 100);
		const off = applyDay(on.items, on.log, '2026-11-24', [], 200);
		expect(off.marks[markKey('2026-11-24', 'a')]).toEqual({ on: false, at: 200 });
		const merged = mergeStates(state({ marks: on.marks }), state({ marks: off.marks }));
		expect(marksToLog(merged.marks, new Set(['a']))).toEqual({});
		const again = applyDay(off.items, off.log, '2026-11-24', ['a'], 300);
		expect(marksToLog(mergeStates(merged, state({ marks: again.marks })).marks, new Set(['a']))).toEqual({ '2026-11-24': ['a'] });
	});
	it('отметки неизвестных вещей в журнал не попадают', () => {
		expect(marksToLog({ [markKey('2026-11-24', 'ghost')]: { on: true, at: 1 } }, new Set(['a']))).toEqual({});
	});
	it('старый журнал превращается в отметки без перезаписи новых', () => {
		const have = { [markKey('2026-11-20', 'a')]: { on: false, at: 99 } };
		const m = logToMarks({ '2026-11-20': ['a', 'b'] }, have);
		expect(m[markKey('2026-11-20', 'a')]).toEqual({ on: false, at: 99 });
		expect(m[markKey('2026-11-20', 'b')].on).toBe(true);
	});
	it('счётчики после слияния считаются заново с учётом старых отметок до журнала', () => {
		const base = [item('a', { wearBase: 4, baseLast: 500, wearCount: 99, lastWorn: 1 })];
		const r = reconcileWear(base, { '2026-11-20': ['a'], '2026-11-22': ['a'] });
		expect(r[0].wearCount).toBe(6);
		expect(r[0].lastWorn).toBeGreaterThan(500);
		const none = reconcileWear(base, {});
		expect(none[0]).toMatchObject({ wearCount: 4, lastWorn: 500 });
	});
	it('снятие последней отметки возвращает дату носки до журнала', () => {
		const items = [item('a', { wearBase: 2, wearCount: 3, baseLast: 777 })];
		const on = applyDay(items, {}, '2026-11-20', ['a'], 1);
		const off = applyDay(on.items, on.log, '2026-11-20', [], 2);
		expect(off.items[0].lastWorn).toBe(777);
	});
});

describe('проверка присланных данных', () => {
	const ok = () => ({
		v: 1,
		items: { a: { ...item('a'), junk: 'x', category: 'sweater', colors: ['beige', 'nope'] } },
		goneItems: { g: 5 },
		marks: { '2026-11-24|a': { on: true, at: 1 }, 'bad key': { on: true, at: 1 } },
		wishes: { w: { ...wish('w'), category: 'shoes', color: 'white' }, v: { ...wish('v'), category: 'nope' } },
		goneWishes: {},
		hidden: { pants: { on: true, at: 1 }, nonsense: { on: true, at: 1 } }
	});
	it('оставляет корректное и выбрасывает лишнее', () => {
		const s = parseState(ok());
		expect(Object.keys(s.items)).toEqual(['a']);
		expect(s.items.a.colors).toEqual(['beige']);
		expect((s.items.a as Record<string, unknown>).junk).toBeUndefined();
		expect(Object.keys(s.marks)).toEqual(['2026-11-24|a']);
		expect(Object.keys(s.wishes)).toEqual(['w']);
		expect(Object.keys(s.hidden)).toEqual(['pants']);
	});
	it('не состояние — ошибка', () => {
		expect(() => parseState(null)).toThrow();
		expect(() => parseState({ v: 2 })).toThrow();
		expect(() => parseState([])).toThrow();
	});
	it('вещь без категории или ключа фото пропускается', () => {
		const r = ok();
		(r.items as Record<string, unknown>).b = { ...item('b'), category: 'zzz' };
		(r.items as Record<string, unknown>).c = { ...item('c'), photoKey: '../etc' };
		expect(Object.keys(parseState(r).items)).toEqual(['a']);
	});
	it('удалённые не воскресают, отрицательные и странные числа обнуляются', () => {
		const r = ok();
		(r.goneItems as Record<string, number>).a = 9;
		(r.items.a as Record<string, unknown>).wearCount = -5;
		expect(parseState(r).items.a).toBeUndefined();
		const r2 = ok();
		(r2.items.a as Record<string, unknown>).wearCount = -5;
		(r2.items.a as Record<string, unknown>).updatedAt = 'x';
		expect(parseState(r2).items.a).toMatchObject({ wearCount: 0, updatedAt: 0 });
	});
	it('слишком большое состояние отклоняется', () => {
		const r = ok();
		const items: Record<string, unknown> = {};
		for (let i = 0; i < 5001; i++) items['i' + i] = item('i' + i);
		expect(() => parseState({ ...r, items })).toThrow();
	});
	it('круговая проверка: что вышло из parseState, парсится так же', () => {
		const s = parseState(ok());
		expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
	});
});
