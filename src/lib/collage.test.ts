import { describe, expect, it } from 'vitest';
import { BOARD, flatlay, MAX_SHOTS, mosaic, MOSAIC_COLS, MOSAIC_ROWS, type Slot } from './collage';
import type { Role } from './outfits';

const SETS: Role[][] = [
	['top', 'bottom'],
	['top', 'bottom', 'shoes'],
	['top', 'second', 'bottom', 'shoes'],
	['top', 'second', 'bottom', 'outer', 'shoes'],
	['top', 'bottom', 'outer', 'shoes'],
	['dress', 'shoes'],
	['dress', 'outer', 'shoes'],
	['dress', 'second', 'shoes'],
	['top']
];
const area = (s: Slot) => s.width * (s.height * (BOARD.h / BOARD.w));
const overlap = (a: Slot, b: Slot) => {
	const h = (s: Slot) => s.height; // в процентах высоты доски
	const ax2 = a.left + a.width, bx2 = b.left + b.width, ay2 = a.top + h(a), by2 = b.top + h(b);
	const w = Math.max(0, Math.min(ax2, bx2) - Math.max(a.left, b.left));
	const t = Math.max(0, Math.min(ay2, by2) - Math.max(a.top, b.top));
	return w * t * (BOARD.h / BOARD.w);
};

describe('раскладка образа', () => {
	it('все вещи целиком лежат на доске', () => {
		for (const set of SETS) {
			for (const s of flatlay(set)) {
				expect(s.left, set + ' ' + s.role).toBeGreaterThanOrEqual(0);
				expect(s.top).toBeGreaterThanOrEqual(0);
				expect(s.left + s.width).toBeLessThanOrEqual(100.1);
				expect(s.top + s.height).toBeLessThanOrEqual(100.1);
			}
		}
	});
	it('ни одна вещь не закрыта другой больше чем наполовину', () => {
		for (const set of SETS) {
			const sl = flatlay(set);
			for (const a of sl) for (const b of sl) if (a !== b) expect(overlap(a, b) / Math.min(area(a), area(b)), set + ' ' + a.role + '/' + b.role).toBeLessThan(0.5);
		}
	});
	it('набор центрирован и занимает большую часть доски', () => {
		for (const set of SETS) {
			const sl = flatlay(set);
			const l = Math.min(...sl.map((s) => s.left)), r = Math.max(...sl.map((s) => s.left + s.width));
			const t = Math.min(...sl.map((s) => s.top)), b = Math.max(...sl.map((s) => s.top + s.height));
			expect(Math.abs(l - (100 - r)), set + ' по горизонтали').toBeLessThan(0.5);
			expect(Math.abs(t - (100 - b)), set + ' по вертикали').toBeLessThan(0.5);
			expect(Math.max(r - l, b - t), set + ' занимает доску').toBeGreaterThan(60);
		}
	});
	it('верх лежит поверх второго слоя и низа, обувь поверх всего', () => {
		const z = Object.fromEntries(flatlay(['top', 'second', 'bottom', 'outer', 'shoes']).map((s) => [s.role, s.z]));
		expect(z.top).toBeGreaterThan(z.second);
		expect(z.top).toBeGreaterThan(z.bottom);
		expect(z.shoes).toBeGreaterThan(z.top);
	});
	it('результат не зависит от порядка ролей и повторов', () => {
		const a = flatlay(['shoes', 'top', 'bottom']);
		const b = flatlay(['bottom', 'top', 'top', 'shoes']);
		const key = (x: Slot[]) => JSON.stringify([...x].sort((p, q) => p.role.localeCompare(q.role)));
		expect(key(a)).toBe(key(b));
		expect(flatlay([])).toEqual([]);
	});
});

describe('мозаика скриншотов', () => {
	it('клетки покрывают доску без пустот и наложений', () => {
		for (let n = 1; n <= MAX_SHOTS; n++) {
			const cells = mosaic(n);
			expect(cells, 'n=' + n).toHaveLength(n);
			const grid = Array.from({ length: MOSAIC_ROWS }, () => Array(MOSAIC_COLS).fill(0));
			for (const [c, r, cs, rs] of cells) {
				expect(c + cs - 1).toBeLessThanOrEqual(MOSAIC_COLS);
				expect(r + rs - 1).toBeLessThanOrEqual(MOSAIC_ROWS);
				for (let y = r - 1; y < r - 1 + rs; y++) for (let x = c - 1; x < c - 1 + cs; x++) grid[y][x]++;
			}
			expect(grid.flat().every((v) => v === 1), 'n=' + n).toBe(true);
		}
	});
	it('число картинок за пределами 1..6 прижимается к краям', () => {
		expect(mosaic(0)).toHaveLength(1);
		expect(mosaic(9)).toHaveLength(MAX_SHOTS);
	});
});
