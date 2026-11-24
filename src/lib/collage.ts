// Раскладки для коллажей. Чистые функции: положение считается в долях доски, поэтому его можно проверять тестами без браузера.
import type { Role } from './outfits';

/** Доска образа: 4:5, как кадр в Instagram. */
export const BOARD = { w: 100, h: 125 };

export type Slot = {
	role: Role;
	/** Всё в процентах от доски. */
	left: number;
	top: number;
	width: number;
	height: number;
	/** Небольшой наклон, градусы: так вещи лежат как на столе, а не как в сетке. */
	rot: number;
	z: number;
};

type Base = { x: number; y: number; w: number; h: number; rot: number; z: number };

// Заготовка «как лежало бы на столе»: верх над низом, второй слой выглядывает слева из-под верха,
// куртка справа, обувь внизу. Если какой-то вещи нет, остальные пересобираются под размер доски.
const BASE: Record<Role, Base> = {
	top: { x: 27, y: 2, w: 50, h: 44, rot: 0, z: 3 },
	dress: { x: 24, y: 2, w: 54, h: 76, rot: 0, z: 3 },
	bottom: { x: 30, y: 38, w: 44, h: 60, rot: 0, z: 2 },
	second: { x: 0, y: 8, w: 42, h: 44, rot: -6, z: 1 },
	outer: { x: 58, y: 0, w: 40, h: 56, rot: 5, z: 1 },
	shoes: { x: 56, y: 74, w: 42, h: 26, rot: -4, z: 4 }
};
const PAD = 2;
const MAX_ZOOM = 1.8;

/** Раскладка вещей образа на доске. Порядок слоёв и позиции зависят только от набора ролей. */
export function flatlay(roles: Role[]): Slot[] {
	const rs = [...new Set(roles)];
	if (!rs.length) return [];
	const x1 = Math.min(...rs.map((r) => BASE[r].x));
	const y1 = Math.min(...rs.map((r) => BASE[r].y));
	const x2 = Math.max(...rs.map((r) => BASE[r].x + BASE[r].w));
	const y2 = Math.max(...rs.map((r) => BASE[r].y + BASE[r].h));
	const k = Math.min((BOARD.w - 2 * PAD) / (x2 - x1), (BOARD.h - 2 * PAD) / (y2 - y1), MAX_ZOOM);
	// центрируем получившийся набор на доске
	const ox = (BOARD.w - (x2 - x1) * k) / 2 - x1 * k;
	const oy = (BOARD.h - (y2 - y1) * k) / 2 - y1 * k;
	const r1 = (n: number) => Math.round(n * 10) / 10;
	return rs.map((role) => {
		const b = BASE[role];
		return {
			role,
			left: r1(((b.x * k + ox) / BOARD.w) * 100),
			top: r1(((b.y * k + oy) / BOARD.h) * 100),
			width: r1(((b.w * k) / BOARD.w) * 100),
			height: r1(((b.h * k) / BOARD.h) * 100),
			rot: b.rot,
			z: b.z
		};
	});
}

/** Клетка мозаики на сетке 6×8 (колонка, строка, ширина, высота), нумерация с 1. */
export type Cell = [col: number, row: number, cols: number, rows: number];
export const MOSAIC_COLS = 6;
export const MOSAIC_ROWS = 8;
export const MAX_SHOTS = 6;

const MOSAICS: Record<number, Cell[]> = {
	1: [[1, 1, 6, 8]],
	2: [[1, 1, 3, 8], [4, 1, 3, 8]],
	3: [[1, 1, 4, 8], [5, 1, 2, 4], [5, 5, 2, 4]],
	4: [[1, 1, 3, 4], [4, 1, 3, 4], [1, 5, 3, 4], [4, 5, 3, 4]],
	5: [[1, 1, 4, 5], [5, 1, 2, 5], [1, 6, 2, 3], [3, 6, 2, 3], [5, 6, 2, 3]],
	6: [[1, 1, 4, 4], [5, 1, 2, 2], [5, 3, 2, 2], [1, 5, 2, 4], [3, 5, 2, 4], [5, 5, 2, 4]]
};

/** Раскладка скриншотов: плотная мозаика без пустот, одна большая картинка и несколько поменьше. */
export const mosaic = (n: number): Cell[] => MOSAICS[Math.min(Math.max(Math.round(n), 1), MAX_SHOTS)] ?? [];
