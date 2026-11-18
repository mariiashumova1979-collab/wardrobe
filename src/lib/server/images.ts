// Чистые функции для поиска картинок: разбор ответа Serper, оценки Claude и рамка вещи.
// Здесь нет сети, поэтому всё это покрыто юнит-тестами.

export type Candidate = {
	id: string;
	title: string;
	source: string;
	thumb: string;
	full: string;
	width: number | null;
	height: number | null;
	/** 0–10: насколько фото совпадает с описанием (только после отбора Claude). */
	fit?: number;
	/** true — вещь надета на человеке или в руках. */
	person?: boolean;
};

type SerperImage = {
	title?: string;
	imageUrl?: string;
	imageWidth?: number;
	imageHeight?: number;
	thumbnailUrl?: string;
	source?: string;
	domain?: string;
};

const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v);

export function mapSerperImages(data: { images?: SerperImage[] } | null | undefined, limit = 20): Candidate[] {
	return (data?.images ?? [])
		.filter((i) => isHttp(i.imageUrl))
		.slice(0, limit)
		.map((i, idx) => ({
			id: String(idx),
			title: i.title ?? '',
			source: i.source || i.domain || '',
			thumb: isHttp(i.thumbnailUrl) ? i.thumbnailUrl : i.imageUrl!,
			full: i.imageUrl!,
			width: typeof i.imageWidth === 'number' ? i.imageWidth : null,
			height: typeof i.imageHeight === 'number' ? i.imageHeight : null
		}));
}

export type Rating = { index: number; fit: number; person: boolean };

/** Оставляет только корректные оценки: индекс в диапазоне, fit 0–10, по одной на картинку. */
export function parseRatings(raw: unknown, count: number): Rating[] {
	const list = (raw as { ratings?: unknown })?.ratings;
	if (!Array.isArray(list)) return [];
	const seen = new Set<number>();
	const out: Rating[] = [];
	for (const r of list as Record<string, unknown>[]) {
		const index = r?.index;
		if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= count || seen.has(index)) continue;
		const fit = typeof r.fit === 'number' && Number.isFinite(r.fit) ? Math.min(10, Math.max(0, r.fit)) : 5;
		seen.add(index);
		out.push({ index, fit, person: r.person === true });
	}
	return out;
}

/**
 * Порядок показа: балл = совпадение минус штраф за человека в кадре.
 * Откровенно мимо (fit < 4) прячем, но только если хороших осталось хотя бы три:
 * если почти всё мимо, лучше показать как есть, чем пустой экран.
 */
export function rankCandidates(items: Candidate[], ratings: Rating[], keep = 12): Candidate[] {
	const by = new Map(ratings.map((r) => [r.index, r]));
	const scored = items.map((c, i) => {
		const r = by.get(i);
		return r ? { ...c, fit: r.fit, person: r.person } : c;
	});
	const good = scored.filter((c) => c.fit !== undefined && c.fit >= 4);
	const pool = good.length >= 3 ? good : scored;
	const score = (c: Candidate) => (c.fit ?? 5) - (c.person ? 3 : 0);
	return [...pool].sort((a, b) => score(b) - score(a)).slice(0, keep);
}

export type Box = { x1: number; y1: number; x2: number; y2: number };

/** Рамка от модели в координатах 0–1000 → доли 0–1; слишком маленькую или кривую отбрасываем. */
export function sanitizeBox(raw: unknown): Box | null {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	if (r.found === false) return null;
	const v = ['x1', 'y1', 'x2', 'y2'].map((k) => r[k]);
	if (!v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
	const [x1, y1, x2, y2] = (v as number[]).map((n) => Math.min(1000, Math.max(0, n)) / 1000);
	if (x2 - x1 < 0.08 || y2 - y1 < 0.08) return null;
	return { x1, y1, x2, y2 };
}

/**
 * Объединяет выдачу нескольких запросов по очереди (по одному кадру из каждого),
 * чтобы ни один запрос не вытеснил остальные. Одинаковые кадры схлопываются.
 */
export function mergeCandidates(lists: Candidate[][], limit = 20): Candidate[] {
	const seen = new Set<string>();
	const out: Candidate[] = [];
	const longest = Math.max(0, ...lists.map((l) => l.length));
	for (let i = 0; i < longest && out.length < limit; i++) {
		for (const list of lists) {
			const c = list[i];
			if (!c || seen.has(c.full)) continue;
			seen.add(c.full);
			out.push({ ...c, id: String(out.length) });
			if (out.length >= limit) break;
		}
	}
	return out;
}
