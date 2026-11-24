import { describe, expect, it } from 'vitest';
import { analyzeGaps } from './gaps';
import { BANDS, bandOf, colorsOk, countLooks, hasLookWith, needFor, planOutfits, roleOf, type Piece } from './outfits';
import { SECOND_LAYER } from './taxonomy';

let n = 0;
const piece = (category: string, colors: string[], o: Partial<Piece> = {}): Piece => ({
	id: `${category}-${colors.join('+')}-${++n}`,
	category,
	colors,
	seasons: [],
	formality: 'casual',
	lastWorn: null,
	...o
});

const closet = () => [
	piece('top', ['white']),
	piece('shirt', ['blue']),
	piece('top', ['black']),
	piece('top', ['beige']),
	piece('sweater', ['beige']),
	piece('cardigan', ['grey']),
	piece('hoodie', ['black']),
	piece('blazer', ['navy'], { formality: 'smart' }),
	piece('turtleneck', ['black']),
	piece('jeans', ['blue']),
	piece('pants', ['black'], { formality: 'smart' }),
	piece('pants', ['beige']),
	piece('skirt', ['black']),
	piece('outer', ['beige']),
	piece('outer', ['black']),
	piece('shoes', ['white']),
	piece('shoes', ['black'])
];

describe('роли и погода', () => {
	it('второй слой — только разрешённые категории', () => {
		for (const c of ['turtleneck', 'sweater', 'cardigan', 'hoodie', 'blazer']) expect(roleOf(c)).toBe('second');
		expect(roleOf('outer')).toBe('outer');
		expect(roleOf('shirt')).toBe('top');
		expect(roleOf('bag')).toBeNull();
	});
	it('границы температур', () => {
		expect(bandOf(30)).toBe('hot');
		expect(bandOf(27)).toBe('hot');
		expect(bandOf(26)).toBe('warm');
		expect(bandOf(20)).toBe('warm');
		expect(bandOf(19)).toBe('mild');
		expect(bandOf(14)).toBe('mild');
		expect(bandOf(13)).toBe('cool');
	});
	it('что нужно надеть', () => {
		expect(needFor('hot')).toMatchObject({ second: 'none', outer: false });
		expect(needFor('warm', { min: 22 }).second).toBe('none');
		expect(needFor('warm', { min: 15 }).second).toBe('optional');
		expect(needFor('mild')).toMatchObject({ second: 'required', outer: false });
		expect(needFor('mild', { rain: true }).outer).toBe(true);
		expect(needFor('cool')).toMatchObject({ second: 'required', outer: true });
	});
});

describe('цвета', () => {
	it('нейтральные сочетаются со всем, два ярких — нет', () => {
		expect(colorsOk([piece('top', ['white']), piece('pants', ['black']), piece('shoes', ['beige'])])).toBe(true);
		expect(colorsOk([piece('top', ['red']), piece('pants', ['navy'])])).toBe(true);
		expect(colorsOk([piece('top', ['red']), piece('pants', ['green'])])).toBe(false);
		expect(colorsOk([piece('top', ['yellow']), piece('skirt', ['purple'])])).toBe(false);
		expect(colorsOk([piece('top', ['red']), piece('pants', ['olive']), piece('outer', ['blue'])])).toBe(false);
		expect(colorsOk([piece('dress', ['multi']), piece('shoes', ['black'])])).toBe(true);
		expect(colorsOk([piece('dress', ['multi']), piece('outer', ['blue'])])).toBe(false);
	});
});

describe('подбор образов', () => {
	it('жарко: без второго слоя и куртки', () => {
		const plan = planOutfits(closet(), 'hot', { seed: 'a' });
		expect(plan.outfits.length).toBeGreaterThanOrEqual(3);
		for (const o of plan.outfits) {
			expect(o.parts.some((p) => p.role === 'second' || p.role === 'outer')).toBe(false);
		}
	});
	it('прохладно: у каждого образа есть второй слой из разрешённых', () => {
		const plan = planOutfits(closet(), 'mild', { seed: 'a' });
		expect(plan.outfits.length).toBeGreaterThanOrEqual(3);
		for (const o of plan.outfits) {
			const second = o.parts.filter((p) => p.role === 'second');
			expect(second).toHaveLength(1);
			expect(SECOND_LAYER.has(second[0].item.category)).toBe(true);
			expect(o.parts.some((p) => p.role === 'outer')).toBe(false);
		}
	});
	it('холодно или дождь: добавляется куртка, и она не заменяет второй слой', () => {
		for (const plan of [planOutfits(closet(), 'cool', { seed: 'a' }), planOutfits(closet(), 'mild', { seed: 'a', rain: true })]) {
			expect(plan.outfits.length).toBeGreaterThanOrEqual(3);
			for (const o of plan.outfits) {
				expect(o.parts.filter((p) => p.role === 'outer')).toHaveLength(1);
				expect(o.parts.filter((p) => p.role === 'second')).toHaveLength(1);
			}
		}
	});
	it('шорты только в жару', () => {
		const items = [...closet(), piece('shorts', ['beige'])];
		const has = (band: 'hot' | 'mild') =>
			planOutfits(items, band, { seed: 'a', count: 40 }).outfits.some((o) => o.parts.some((p) => p.item.category === 'shorts'));
		expect(has('hot')).toBe(true);
		expect(has('mild')).toBe(false);
	});
	it('3–4 варианта, не повторяющие верх и низ', () => {
		const plan = planOutfits(closet(), 'warm', { seed: 'a' });
		expect(plan.outfits.length).toBe(4);
		const keys = plan.outfits.map((o) =>
			o.parts
				.filter((p) => p.role === 'top' || p.role === 'bottom' || p.role === 'dress')
				.map((p) => p.item.id)
				.join('|')
		);
		expect(new Set(keys).size).toBe(keys.length);
	});
	it('красный верх не попадает в образ с зелёным низом', () => {
		const items = [
			piece('top', ['red']),
			piece('pants', ['green']),
			piece('pants', ['black']),
			piece('top', ['white']),
			piece('shoes', ['black'])
		];
		const plan = planOutfits(items, 'hot', { seed: 'a', count: 10 });
		expect(plan.outfits.length).toBeGreaterThan(0);
		for (const o of plan.outfits) {
			const names = o.parts.flatMap((p) => p.item.colors);
			expect(names.includes('red') && names.includes('green')).toBe(false);
		}
	});
	it('вещь не по сезону не берётся; если выбора нет, берётся с пометкой', () => {
		const winter = piece('top', ['white'], { seasons: ['winter'] });
		const items = [winter, piece('pants', ['black']), piece('shoes', ['black'])];
		const plan = planOutfits(items, 'hot', { seed: 'a' });
		expect(plan.relaxed).toBe(true);
		expect(plan.outfits).toHaveLength(1);
		const withSummer = planOutfits([...items, piece('top', ['beige'], { seasons: ['summer'] })], 'hot', { seed: 'a', count: 10 });
		expect(withSummer.relaxed).toBe(false);
		for (const o of withSummer.outfits) expect(o.parts.some((p) => p.item.id === winter.id)).toBe(false);
	});
	it('без обуви образы собираются, но нехватка названа', () => {
		const plan = planOutfits(closet().filter((i) => i.category !== 'shoes'), 'hot', { seed: 'a' });
		expect(plan.outfits.length).toBeGreaterThan(0);
		expect(plan.missing).toContain('shoes');
	});
	it('нет второго слоя в холод — образы без него и пометка', () => {
		const plan = planOutfits(closet().filter((i) => roleOf(i.category) !== 'second'), 'mild', { seed: 'a' });
		expect(plan.outfits.length).toBeGreaterThan(0);
		expect(plan.missing).toContain('second');
	});
	it('одинаковое зерно — одинаковый результат, другое — другие образы', () => {
		const items = closet();
		const ids = (seed: string) => planOutfits(items, 'warm', { seed, now: 0 }).outfits.map((o) => o.parts.map((p) => p.item.id).join());
		expect(ids('x')).toEqual(ids('x'));
		expect(ids('x')).not.toEqual(ids('y'));
	});
	it('платье с вторым слоем и обувью', () => {
		const items = [piece('dress', ['black']), piece('cardigan', ['beige']), piece('shoes', ['black'])];
		const plan = planOutfits(items, 'mild', { seed: 'a' });
		expect(plan.outfits).toHaveLength(1);
		expect(plan.outfits[0].parts.map((p) => p.role)).toEqual(['second', 'dress', 'shoes'].sort((a, b) => ['top', 'second', 'dress', 'bottom', 'outer', 'shoes'].indexOf(a) - ['top', 'second', 'dress', 'bottom', 'outer', 'shoes'].indexOf(b)));
	});
	it('пустой гардероб не падает', () => {
		const plan = planOutfits([], 'cool');
		expect(plan.outfits).toEqual([]);
		expect(plan.missing).toEqual(expect.arrayContaining(['shoes', 'bottom', 'top', 'second', 'outer']));
	});
});

describe('подсчёт образов', () => {
	it('считает не больше предела и требует обувь', () => {
		expect(countLooks(closet(), 'hot', 5)).toBe(5);
		expect(countLooks(closet().filter((i) => i.category !== 'shoes'), 'hot', 5)).toBe(0);
	});
	it('вещь без пары определяется', () => {
		const purple = piece('top', ['purple']);
		const red = piece('skirt', ['red']);
		const items = [purple, red, piece('pants', ['black']), piece('shoes', ['black'])];
		expect(hasLookWith(items, 'hot', purple)).toBe(true);
		expect(hasLookWith(items, 'hot', red)).toBe(false);
	});
});

describe('дыры в гардеробе', () => {
	it('мало вещей — рано анализировать', () => {
		expect(analyzeGaps([piece('top', ['white'])]).tooFew).toBe(true);
	});
	it('нет обуви — первым в списке покупок', () => {
		const r = analyzeGaps(closet().filter((i) => i.category !== 'shoes'));
		expect(r.bands.every((b) => b.missing.includes('shoes'))).toBe(true);
		expect(r.buy[0].category).toBe('shoes');
		expect(r.buy[0].why).toContain('обуви');
	});
	it('нет куртки — холодный день помечен', () => {
		const r = analyzeGaps(closet().filter((i) => i.category !== 'outer'));
		const cool = r.bands.find((b) => b.band === 'cool')!;
		expect(cool.level).toBe('none');
		expect(cool.missing).toContain('outer');
		expect(r.buy.some((b) => b.category === 'outer')).toBe(true);
	});
	it('вещь без пары попадает в список с причиной', () => {
		const red = piece('skirt', ['red']);
		const r = analyzeGaps([piece('top', ['purple']), red, piece('pants', ['black']), piece('shoes', ['black'])]);
		expect(r.orphans.map((o) => o.item.id)).toContain(red.id);
		expect(r.orphans.find((o) => o.item.id === red.id)!.why).toBeTruthy();
	});
	it('полный гардероб: образов достаточно, у всех периодов нет пробелов', () => {
		const r = analyzeGaps(closet());
		expect(r.tooFew).toBe(false);
		expect(r.bands.map((b) => b.level)).toEqual(['ok', 'ok', 'ok', 'ok']);
		expect(r.orphans).toEqual([]);
		expect(BANDS).toHaveLength(r.bands.length);
	});
	it('названия покупок согласованы по роду и числу', () => {
		const r = analyzeGaps(closet().filter((i) => i.category !== 'shoes'));
		const titles = r.buy.map((b) => b.title);
		expect(titles.every((t) => /^[А-ЯЁ]/.test(t))).toBe(true);
		expect(titles[0]).toMatch(/^(Белая|Чёрная|Бежевая|Тёмно-синяя|Серая|Коричневая) обувь$/);
	});
});

describe('пометка «давно не надевала»', () => {
	it('ставится по надетым вещам, даже если другие ещё не надеты', () => {
		const now = 100 * 86_400_000;
		const items = [
			piece('top', ['white'], { lastWorn: now - 40 * 86_400_000 }),
			piece('pants', ['black']),
			piece('shoes', ['black'], { lastWorn: now - 1 * 86_400_000 })
		];
		expect(planOutfits(items, 'hot', { seed: 'a', now }).outfits[0].fresh).toBe('long');
		const fresh = items.map((i) => ({ ...i, lastWorn: now - 86_400_000 }));
		expect(planOutfits(fresh, 'hot', { seed: 'a', now }).outfits[0].fresh).toBeNull();
	});
});

describe('покупки закрывают отсутствующий слой', () => {
	it('нет верхней одежды — она в списке, даже если выигрыш мал', () => {
		const small = [
			piece('top', ['white'], { seasons: ['spring', 'autumn'] }),
			piece('shirt', ['blue'], { seasons: ['spring', 'autumn'] }),
			piece('cardigan', ['grey'], { seasons: ['spring', 'autumn'] }),
			piece('jeans', ['blue']),
			piece('skirt', ['black']),
			piece('shoes', ['white'])
		];
		const r = analyzeGaps(small);
		expect(r.bands.find((b) => b.band === 'cool')!.missing).toContain('outer');
		const outer = r.buy.find((b) => b.category === 'outer');
		expect(outer).toBeTruthy();
		expect(outer!.why).toContain('верхней одежды');
		expect(r.buy.length).toBeLessThanOrEqual(5);
	});
});

describe('редактируемые дыры', () => {
	const base = () => [
		piece('top', ['white']),
		piece('top', ['black']),
		piece('jeans', ['blue']),
		piece('pants', ['black']),
		piece('shoes', ['white'])
	];
	it('скрытая категория больше не предлагается, на её место встаёт другая', async () => {
		const { analyzeGaps } = await import('./gaps');
		const first = analyzeGaps(base()).buy.map((b) => b.category);
		expect(first.length).toBeGreaterThan(0);
		const hide = first[0];
		const after = analyzeGaps(base(), [hide]).buy.map((b) => b.category);
		expect(after).not.toContain(hide);
	});
	it('скрытый недостающий слой тоже не возвращается', async () => {
		const { analyzeGaps } = await import('./gaps');
		const r = analyzeGaps(base(), ['outer']);
		expect(r.bands.find((b) => b.band === 'cool')!.missing).toContain('outer'); // дыра остаётся видна
		expect(r.buy.some((b) => b.category === 'outer')).toBe(false); // но не предлагается
	});
	it('прирост от желаемой вещи: нужная вещь даёт образы, ненужная ничего, сумка не считается', async () => {
		const { wishGain } = await import('./gaps');
		const items = base();
		const sweater = wishGain(items, { category: 'sweater', color: 'beige' })!;
		expect(sweater).toBeGreaterThan(0); // второй слой нужен в прохладу и холод
		expect(wishGain(items, { category: 'backpack', color: 'black' })).toBeNull();
		const flood = [...items, ...Array.from({ length: 8 }, (_, i) => piece('top', ['white'], { id: 'x' + i }))];
		expect(wishGain(flood, { category: 'top', color: 'white' })!).toBeLessThanOrEqual(wishGain(items, { category: 'top', color: 'white' })!);
	});
	it('цвет «любой» считается как нейтральный', async () => {
		const { wishGain } = await import('./gaps');
		expect(wishGain(base(), { category: 'sweater', color: '' })!).toBeGreaterThan(0);
	});
});
