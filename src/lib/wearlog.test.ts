import { describe, expect, it } from 'vitest';
import { addDays, ago, dateKey, daysBetween, parseKey } from './dates';
import { GROUPS, groupOf, wearStats } from './stats';
import { applyDay, dropFromLog, lastDate, type WearLog } from './wearlog';

const it_ = (id: string, category = 'top', o: Partial<{ wearCount: number; lastWorn: number | null; name: string }> = {}) => ({
	id,
	category,
	name: o.name ?? id,
	wearCount: o.wearCount ?? 0,
	lastWorn: o.lastWorn ?? null
});

describe('даты', () => {
	it('ключ дня и обратно', () => {
		expect(dateKey(new Date(2026, 10, 4))).toBe('2026-11-04');
		expect(dateKey(parseKey('2026-11-24'))).toBe('2026-11-24');
	});
	it('сдвиг через границы месяца и года, в том числе через смену времени', () => {
		expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
		expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
		expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
		expect(daysBetween('2026-03-20', '2026-04-05')).toBe(16);
	});
	it('«сколько назад»', () => {
		const t = '2026-11-24';
		expect(ago(null, t)).toBe('ещё не надевала');
		expect(ago(t, t)).toBe('сегодня');
		expect(ago('2026-11-23', t)).toBe('вчера');
		expect(ago('2026-11-19', t)).toBe('5 дн. назад');
		expect(ago('2026-10-27', t)).toBe('4 нед. назад');
		expect(ago('2026-06-24', t)).toBe('5 мес. назад');
	});
});

describe('журнал носки', () => {
	it('запись дня меняет счётчики и дату последней носки', () => {
		const items = [it_('a'), it_('b'), it_('c')];
		const r1 = applyDay(items, {}, '2026-11-20', ['a', 'b']);
		expect(r1.log).toEqual({ '2026-11-20': ['a', 'b'] });
		expect(r1.items.map((i) => i.wearCount)).toEqual([1, 1, 0]);
		expect(r1.items[0].lastWorn).toBe(parseKey('2026-11-20').getTime());
		expect(r1.items[2].lastWorn).toBeNull();

		// другой день: a надета ещё раз, b заменена на c
		const r2 = applyDay(r1.items, r1.log, '2026-11-22', ['a', 'c']);
		expect(r2.items.map((i) => i.wearCount)).toEqual([2, 1, 1]);
		expect(r2.items[0].lastWorn).toBe(parseKey('2026-11-22').getTime());

		// правка старого дня: b снимаем, счётчик и дата откатываются
		const r3 = applyDay(r2.items, r2.log, '2026-11-20', ['a']);
		expect(r3.items.map((i) => i.wearCount)).toEqual([2, 0, 1]);
		expect(r3.items[1].lastWorn).toBeNull();
	});
	it('повторная запись того же не накручивает счётчик', () => {
		const items = [it_('a')];
		const r1 = applyDay(items, {}, '2026-11-20', ['a']);
		const r2 = applyDay(r1.items, r1.log, '2026-11-20', ['a', 'a']);
		expect(r2.items[0].wearCount).toBe(1);
	});
	it('пустой список удаляет запись дня; неизвестные вещи игнорируются; счётчик не уходит ниже нуля', () => {
		const items = [it_('a', 'top', { wearCount: 0 })];
		const r1 = applyDay(items, { '2026-11-20': ['a'] }, '2026-11-20', []);
		expect(r1.log).toEqual({});
		expect(r1.items[0].wearCount).toBe(0);
		expect(applyDay(items, {}, '2026-11-20', ['ghost']).log).toEqual({});
	});
	it('счётчик из старых отметок (до журнала) сохраняется', () => {
		const items = [it_('a', 'top', { wearCount: 5 })];
		const r = applyDay(items, {}, '2026-11-20', ['a']);
		expect(r.items[0].wearCount).toBe(6);
		expect(applyDay(r.items, r.log, '2026-11-20', []).items[0].wearCount).toBe(5);
	});
	it('удалённая вещь пропадает из всех дней', () => {
		const log: WearLog = { '2026-11-20': ['a', 'b'], '2026-11-21': ['a'] };
		expect(dropFromLog(log, 'a')).toEqual({ '2026-11-20': ['b'] });
		expect(lastDate(log, 'a')).toBe('2026-11-21');
		expect(lastDate(log, 'zzz')).toBeNull();
	});
});

describe('статистика носки', () => {
	const today = '2026-11-24';
	const items = [
		it_('t1', 'top', { name: 'Футболка', wearCount: 9 }),
		it_('t2', 'sweater', { name: 'Джемпер', wearCount: 1 }),
		it_('s1', 'shoes', { name: 'Кеды', wearCount: 3 }),
		it_('s2', 'shoes', { name: 'Лоферы' }),
		it_('b1', 'backpack', { name: 'Рюкзак', wearCount: 2 }),
		it_('b2', 'bag', { name: 'Сумка' })
	];
	const log: WearLog = {
		'2026-11-24': ['t1', 's1', 'b1'],
		'2026-11-20': ['t1', 't2', 's1'],
		'2026-10-01': ['t1', 'b1'], // раньше 30 дней, но в пределах 90
		'2026-05-01': ['t1'], // старше 90 дней
		'2026-11-30': ['t2'] // будущее не считаем
	};

	it('группы: одежда, обувь, сумки и рюкзаки', () => {
		expect(groupOf('shoes')).toBe('shoes');
		expect(groupOf('backpack')).toBe('bags');
		expect(groupOf('bag')).toBe('bags');
		expect(groupOf('acc')).toBe('clothes');
		expect(GROUPS.map((g) => g.id)).toEqual(['clothes', 'shoes', 'bags']);
	});
	it('30 дней считает по датам журнала', () => {
		const s = wearStats(items, log, 30, today);
		expect(s.map((g) => g.group)).toEqual(['clothes', 'shoes', 'bags']);
		const clothes = s[0];
		expect(clothes.rows.map((r) => [r.item.id, r.count])).toEqual([
			['t1', 2],
			['t2', 1]
		]);
		expect(clothes.worn).toBe(2);
		const shoes = s[1];
		expect(shoes.rows.map((r) => [r.item.id, r.count])).toEqual([
			['s1', 2],
			['s2', 0]
		]);
		expect(shoes.worn).toBe(1);
		expect(shoes.total).toBe(2);
		const bags = s[2];
		expect(bags.rows.map((r) => [r.item.id, r.count])).toEqual([
			['b1', 1],
			['b2', 0]
		]);
		expect(bags.rows[0].last).toBe('2026-11-24');
	});
	it('границы периода включают первый день', () => {
		const s = wearStats([it_('x')], { '2026-10-26': ['x'], '2026-10-25': ['x'] }, 30, today);
		expect(s[0].rows[0].count).toBe(1); // 30 дней: с 26 октября по 24 ноября
	});
	it('90 дней захватывает октябрь, но не май', () => {
		expect(wearStats(items, log, 90, today)[0].rows.find((r) => r.item.id === 't1')!.count).toBe(3);
	});
	it('за всё время берёт счётчик вещи, включая старые отметки', () => {
		const all = wearStats(items, log, 'all', today)[0];
		expect(all.rows[0]).toMatchObject({ count: 9 });
		expect(all.rows.find((r) => r.item.id === 't2')!.count).toBe(1);
	});
	it('вещь без записей в журнале берёт дату последней носки со своей карточки', () => {
		const old = it_('o', 'top', { wearCount: 4, lastWorn: parseKey('2026-09-01').getTime() });
		expect(wearStats([old], {}, 'all', today)[0].rows[0].last).toBe('2026-09-01');
	});
	it('пустые группы не показываются', () => {
		expect(wearStats([it_('x')], {}, 30, today).map((g) => g.group)).toEqual(['clothes']);
	});
});
