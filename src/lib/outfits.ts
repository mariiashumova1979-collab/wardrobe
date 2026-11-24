// Подбор комплектов: чистые функции без обращения к браузеру, чтобы их можно было тестировать.
import { SECOND_LAYER } from './taxonomy';

/** Минимум, который нужен подбору от вещи. Item из хранилища ему подходит. */
export type Piece = {
	id: string;
	category: string;
	colors: string[];
	seasons: string[];
	formality: string;
	lastWorn: number | null;
};

export type Role = 'top' | 'second' | 'bottom' | 'dress' | 'outer' | 'shoes';

export const ROLE_LABEL: Record<Role, string> = {
	top: 'Верх',
	second: '2-й слой',
	bottom: 'Низ',
	dress: 'Платье',
	outer: 'Куртка',
	shoes: 'Обувь'
};
/** Для фраз «не хватает …» */
export const ROLE_GEN: Record<Role, string> = {
	top: 'верха',
	second: 'второго слоя',
	bottom: 'низа',
	dress: 'платья',
	outer: 'верхней одежды',
	shoes: 'обуви'
};
export const ROLE_ORDER: Role[] = ['top', 'second', 'dress', 'bottom', 'outer', 'shoes'];

export function roleOf(category: string): Role | null {
	if (category === 'top' || category === 'shirt') return 'top';
	// Второй слой — только то, что разрешено правилом: пиджак, жакет, худи, свитер, джемпер, водолазка, кардиган
	if (SECOND_LAYER.has(category)) return 'second';
	if (category === 'pants' || category === 'jeans' || category === 'skirt' || category === 'shorts') return 'bottom';
	if (category === 'dress') return 'dress';
	if (category === 'outer') return 'outer';
	if (category === 'shoes') return 'shoes';
	return null; // сумки и аксессуары в комплекты не входят
}

// ---------- погода → что нужно надеть ----------

export type Band = 'hot' | 'warm' | 'mild' | 'cool';

export const BANDS: { id: Band; label: string; hint: string }[] = [
	{ id: 'hot', label: 'Жарко', hint: 'от 27°' },
	{ id: 'warm', label: 'Тепло', hint: '20–26°' },
	{ id: 'mild', label: 'Прохладно', hint: '14–19°' },
	{ id: 'cool', label: 'Холодно', hint: 'ниже 14°' }
];

/** По температуре «как ощущается». */
export function bandOf(t: number): Band {
	return t >= 27 ? 'hot' : t >= 20 ? 'warm' : t >= 14 ? 'mild' : 'cool';
}

export type Need = {
	second: 'none' | 'optional' | 'required';
	outer: boolean;
	/** Какие сезоны на вещи подходят под эту погоду. */
	seasons: readonly string[];
};

export function needFor(band: Band, o: { min?: number; rain?: boolean } = {}): Need {
	switch (band) {
		case 'hot':
			return { second: 'none', outer: false, seasons: ['summer'] };
		case 'warm':
			// днём без слоёв, но если вечером заметно холоднее — второй слой уместен
			return { second: (o.min ?? 99) < 18 ? 'optional' : 'none', outer: false, seasons: ['summer', 'spring', 'autumn'] };
		case 'mild':
			return { second: 'required', outer: !!o.rain, seasons: ['spring', 'autumn', 'winter'] };
		default:
			return { second: 'required', outer: true, seasons: ['winter', 'autumn'] };
	}
}

// ---------- цвет и формальность ----------

const NEUTRAL = new Set(['black', 'white', 'grey', 'beige', 'brown', 'navy']);
const LOUD = new Set(['red', 'pink', 'orange', 'yellow', 'purple', 'multi']);
// Пары, которые спорят друг с другом, даже если цветных всего два
const CLASH = new Set(['green|red', 'orange|red', 'orange|pink', 'orange|purple']);
const RANK: Record<string, number> = { sport: 0, casual: 1, smart: 2, business: 3, evening: 4 };
const rank = (p: Piece) => RANK[p.formality] ?? 1;

/** Не нейтральные цвета в наборе вещей. */
export function accents(items: Piece[]): string[] {
	const s = new Set<string>();
	for (const p of items) for (const c of p.colors) if (!NEUTRAL.has(c)) s.add(c);
	return [...s];
}

/** Не больше двух цветных, из них не больше одного яркого и без спорных пар; принт носим без других цветных. */
export function colorsOk(items: Piece[]): boolean {
	const a = accents(items);
	if (a.length > 2) return false;
	if (a.filter((c) => LOUD.has(c)).length > 1) return false;
	if (a.includes('multi') && a.length > 1) return false;
	if (a.length === 2 && CLASH.has([...a].sort().join('|'))) return false;
	return true;
}

/** Спорт и вечерний/деловой стиль в одном образе не сочетаются. */
function formalOk(items: Piece[]): boolean {
	const r = items.map(rank);
	return Math.max(...r) - Math.min(...r) <= 2;
}

// ---------- перебор образов ----------

export type Part<T> = { role: Role; item: T };
type Look<T> = { parts: Part<T>[]; score: number };
type Ctx = { band: Band; need: Need; relax: boolean; strict: boolean; now: number; seed: string };

const DAY = 86_400_000;
const CAP: Record<Role, number> = { top: 10, second: 10, bottom: 10, dress: 8, outer: 6, shoes: 8 };

function rnd(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) / 4294967296;
}

const rotation = (p: Piece, now: number) =>
	p.lastWorn == null ? 0.5 : (0.5 * Math.min(21, Math.max(0, (now - p.lastWorn) / DAY))) / 21;

export function eligible(p: Piece, band: Band, need: Need, relax = false): boolean {
	if (p.category === 'shorts' && (band === 'mild' || band === 'cool')) return false;
	if (relax || p.seasons.length === 0) return true;
	return p.seasons.some((s) => need.seasons.includes(s));
}

function scoreOf<T extends Piece>(parts: Part<T>[], ctx: Ctx): number {
	const items = parts.map((p) => p.item);
	let s = 0;
	const acc = accents(items).length;
	s += acc === 0 ? 1 : acc === 1 ? 1.5 : 0.3;
	const r = items.map(rank);
	const spread = Math.max(...r) - Math.min(...r);
	if (spread > 1) s -= 1.2 * (spread - 1);
	for (const it of items) {
		if (it.seasons.length) s += it.seasons.some((x) => ctx.need.seasons.includes(x)) ? 0.4 : -2;
		s += rotation(it, ctx.now);
		if (ctx.band === 'cool' && (it.category === 'dress' || it.category === 'skirt')) s -= 0.8;
	}
	if (ctx.need.second === 'optional' && parts.some((p) => p.role === 'second')) s += 0.6;
	return s + rnd(ctx.seed + items.map((i) => i.id).sort().join('|')) * 0.9;
}

function buildPools<T extends Piece>(items: T[], ctx: Ctx, only?: T): Record<Role, T[]> {
	const pools: Record<Role, T[]> = { top: [], second: [], bottom: [], dress: [], outer: [], shoes: [] };
	for (const it of items) {
		const r = roleOf(it.category);
		if (r && eligible(it, ctx.band, ctx.need, ctx.relax)) pools[r].push(it);
	}
	// В пуле остаются самые «свежие» вещи — иначе перебор разрастается; при «другие варианты» набор меняется
	const pre = (p: Piece) => rotation(p, ctx.now) + rnd(ctx.seed + p.id) * 1.5;
	for (const r of Object.keys(pools) as Role[]) {
		pools[r] = pools[r].sort((a, b) => pre(b) - pre(a)).slice(0, CAP[r]);
	}
	if (only) {
		const r = roleOf(only.category);
		if (r) pools[r] = eligible(only, ctx.band, ctx.need, ctx.relax) ? [only] : [];
	}
	return pools;
}

function* looks<T extends Piece>(items: T[], ctx: Ctx, only?: T): Generator<Look<T>> {
	const pools = buildPools(items, ctx, only);
	const { need } = ctx;
	const withSecond = need.second !== 'none';
	// Нет ни одного второго слоя: в свободном режиме всё равно собираем образы, а нехватку покажем отдельно
	const withoutSecond = need.second !== 'required' || (!ctx.strict && pools.second.length === 0);

	const frames: Part<T>[][] = [];
	const uppers: Part<T>[][] = [];
	for (const t of pools.top) {
		if (withoutSecond) uppers.push([{ role: 'top', item: t }]);
		if (withSecond) for (const s of pools.second) uppers.push([{ role: 'top', item: t }, { role: 'second', item: s }]);
	}
	// Базовых вещей нет, зато есть второй слой: он идёт как верх
	if (!pools.top.length && withSecond) for (const s of pools.second) uppers.push([{ role: 'second', item: s }]);
	for (const u of uppers) for (const b of pools.bottom) frames.push([...u, { role: 'bottom', item: b }]);
	for (const d of pools.dress) {
		if (withoutSecond) frames.push([{ role: 'dress', item: d }]);
		if (withSecond) for (const s of pools.second) frames.push([{ role: 'dress', item: d }, { role: 'second', item: s }]);
	}

	const outers: (Part<T> | null)[] =
		need.outer && (pools.outer.length || ctx.strict)
			? pools.outer.map((o) => ({ role: 'outer' as const, item: o }))
			: [null];

	for (const frame of frames) {
		if (!colorsOk(frame.map((p) => p.item))) continue;
		for (const o of outers) {
			const body = o ? [...frame, o] : frame;
			const bi = body.map((p) => p.item);
			if (!colorsOk(bi) || !formalOk(bi)) continue;
			let best: Look<T> | null = null;
			if (!pools.shoes.length) {
				if (ctx.strict) continue;
				best = { parts: body, score: scoreOf(body, ctx) };
			} else {
				for (const sh of pools.shoes) {
					const parts = [...body, { role: 'shoes' as const, item: sh }];
					const pi = parts.map((p) => p.item);
					if (!colorsOk(pi) || !formalOk(pi)) continue;
					const sc = scoreOf(parts, ctx);
					if (!best || sc > best.score) best = { parts, score: sc };
				}
			}
			if (best) yield best;
		}
	}
}

// ---------- публичный подбор ----------

export type Outfit<T> = {
	parts: Part<T>[];
	score: number;
	palette: 'neutral' | 'accent' | 'duo';
	accent: string | null;
	/** В образе есть вещь, которую давно не надевала. */
	fresh: 'never' | 'long' | null;
};

export type Plan<T> = {
	outfits: Outfit<T>[];
	/** Чего в гардеробе нет под эту погоду. */
	missing: Role[];
	/** Пришлось взять вещи не по сезону: подходящих по сезону не хватило. */
	relaxed: boolean;
	need: Need;
};

export type PlanOpts = { min?: number; rain?: boolean; seed?: string; count?: number; now?: number };

const mainKey = <T extends Piece>(l: Look<T>) =>
	l.parts
		.filter((p) => p.role === 'top' || p.role === 'bottom' || p.role === 'dress')
		.map((p) => p.item.id)
		.join('|');

function pickDiverse<T extends Piece>(cands: Look<T>[], count: number): Look<T>[] {
	const chosen: Look<T>[] = [];
	const left = [...cands];
	const lead = (l: Look<T>) => l.parts[0].item.colors[0];
	while (chosen.length < count && left.length) {
		let bi = -1;
		let bv = -Infinity;
		for (let i = 0; i < left.length; i++) {
			const c = left[i];
			let pen = 0;
			let dup = false;
			for (const ch of chosen) {
				// отличаться только курткой или обувью мало: это тот же образ
				if (mainKey(c) === mainKey(ch)) {
					dup = true;
					break;
				}
				for (const p of c.parts) {
					if (ch.parts.some((q) => q.item.id === p.item.id)) pen += p.role === 'shoes' ? 0.4 : 1.2;
				}
				if (lead(c) === lead(ch)) pen += 0.8;
			}
			if (dup) continue;
			const v = c.score - pen;
			if (v > bv) {
				bv = v;
				bi = i;
			}
		}
		if (bi < 0) break;
		chosen.push(left.splice(bi, 1)[0]);
	}
	return chosen;
}

function describe<T extends Piece>(l: Look<T>, now: number): Outfit<T> {
	const items = l.parts.map((p) => p.item);
	const a = accents(items);
	const worn = items.map((i) => i.lastWorn);
	return {
		parts: [...l.parts].sort((x, y) => ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role)),
		score: l.score,
		palette: a.length === 0 ? 'neutral' : a.length === 1 ? 'accent' : 'duo',
		accent: a[0] ?? null,
		fresh: worn.some((w) => w != null && now - w >= 21 * DAY) ? 'long' : worn.some((w) => w == null) ? 'never' : null
	};
}

const ctxOf = (band: Band, o: PlanOpts, extra: Partial<Ctx>): Ctx => ({
	band,
	need: needFor(band, o),
	relax: false,
	strict: false,
	now: o.now ?? Date.now(),
	seed: o.seed ?? '',
	...extra
});

/** Каких ролей нет в гардеробе под эту погоду. */
export function missingRoles<T extends Piece>(items: T[], band: Band, o: PlanOpts = {}, relax = false): Role[] {
	const ctx = ctxOf(band, o, { relax, strict: true });
	const p = buildPools(items, ctx);
	const m: Role[] = [];
	if (!p.shoes.length) m.push('shoes');
	if (!p.bottom.length && !p.dress.length) m.push('bottom');
	if (!p.top.length && !p.dress.length && !(ctx.need.second === 'required' && p.second.length)) m.push('top');
	if (ctx.need.second === 'required' && !p.second.length) m.push('second');
	if (ctx.need.outer && !p.outer.length) m.push('outer');
	return m;
}

/** 3–4 разных образа на выбранную погоду. */
export function planOutfits<T extends Piece>(items: T[], band: Band, o: PlanOpts = {}): Plan<T> {
	const count = o.count ?? 4;
	const now = o.now ?? Date.now();
	const run = (relax: boolean) => {
		const all = [...looks(items, ctxOf(band, o, { relax }))].sort((a, b) => b.score - a.score);
		return pickDiverse(all.slice(0, 400), count);
	};
	let relaxed = false;
	let picked = run(false);
	if (!picked.length) {
		picked = run(true);
		relaxed = picked.length > 0;
	}
	return {
		outfits: picked.map((l) => describe(l, now)),
		missing: missingRoles(items, band, o, relaxed || !picked.length),
		relaxed,
		need: needFor(band, o)
	};
}

// ---------- для анализа «дыр» ----------

/** Сколько разных образов можно собрать (строго: нужны все слои и обувь), считаем не больше limit. */
export function countLooks<T extends Piece>(items: T[], band: Band, limit: number, o: PlanOpts = {}): number {
	let n = 0;
	for (const _ of looks(items, ctxOf(band, o, { strict: true, now: 0 }))) {
		if (++n >= limit) break;
	}
	return n;
}

/** Есть ли хоть один образ с этой вещью. */
export function hasLookWith<T extends Piece>(items: T[], band: Band, item: T, o: PlanOpts = {}): boolean {
	for (const l of looks(items, ctxOf(band, o, { strict: true, now: 0 }), item)) {
		if (l.parts.some((p) => p.item.id === item.id)) return true;
	}
	return false;
}
