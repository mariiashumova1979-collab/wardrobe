// «Дыры в гардеробе»: где не из чего собрать образ и что докупить, чтобы вещи начали сочетаться.
import {
	BANDS,
	ROLE_GEN,
	countLooks,
	eligible,
	hasLookWith,
	missingRoles,
	needFor,
	roleOf,
	type Band,
	type Piece,
	type Role
} from './outfits';
import { pluralRu } from './taxonomy';

/** Столько разных образов на погоду — уже достаточно, дальше считать незачем. */
export const ENOUGH = 12;
/** Образов меньше этого — «мало». */
export const FEW = 6;
/** Холодные дни в Лимассоле короткие, поэтому весят меньше. */
const WEIGHT: Record<Band, number> = { hot: 1, warm: 1, mild: 1, cool: 0.6 };

export type BandReport = {
	band: Band;
	label: string;
	hint: string;
	looks: number;
	level: 'none' | 'few' | 'ok';
	missing: Role[];
};
export type Orphan<T> = { item: T; why: string };
export type Buy = { category: string; color: string; title: string; examples: string; why: string; gain: number };
export type GapReport<T> = {
	/** Меньше трёх вещей: анализировать рано. */
	tooFew: boolean;
	counts: Record<Role, number>;
	bands: BandReport[];
	orphans: Orphan<T>[];
	buy: Buy[];
};

type Gender = 0 | 1 | 2 | 3; // м, ж, ср, мн
const CANDIDATES: { cat: string; formality: string; noun: string; g: Gender; examples: string }[] = [
	{ cat: 'top', formality: 'casual', noun: 'футболка', g: 1, examples: 'базовая футболка или топ' },
	{ cat: 'shirt', formality: 'smart', noun: 'рубашка', g: 1, examples: 'классическая рубашка или блуза' },
	{ cat: 'turtleneck', formality: 'smart', noun: 'водолазка', g: 1, examples: 'тонкая водолазка' },
	{ cat: 'sweater', formality: 'casual', noun: 'джемпер', g: 0, examples: 'джемпер или свитер' },
	{ cat: 'cardigan', formality: 'casual', noun: 'кардиган', g: 0, examples: 'кардиган' },
	{ cat: 'blazer', formality: 'smart', noun: 'пиджак', g: 0, examples: 'пиджак или жакет' },
	{ cat: 'outer', formality: 'casual', noun: 'куртка', g: 1, examples: 'тренч, пальто или лёгкая куртка' },
	{ cat: 'pants', formality: 'smart', noun: 'брюки', g: 3, examples: 'брюки прямого кроя' },
	{ cat: 'jeans', formality: 'casual', noun: 'джинсы', g: 3, examples: 'джинсы' },
	{ cat: 'skirt', formality: 'smart', noun: 'юбка', g: 1, examples: 'юбка миди' },
	{ cat: 'shoes', formality: 'casual', noun: 'обувь', g: 1, examples: 'кеды, лоферы или ботинки' }
];
const NEUTRALS: [string, [string, string, string, string]][] = [
	['white', ['белый', 'белая', 'белое', 'белые']],
	['black', ['чёрный', 'чёрная', 'чёрное', 'чёрные']],
	['beige', ['бежевый', 'бежевая', 'бежевое', 'бежевые']],
	['navy', ['тёмно-синий', 'тёмно-синяя', 'тёмно-синее', 'тёмно-синие']],
	['grey', ['серый', 'серая', 'серое', 'серые']],
	['brown', ['коричневый', 'коричневая', 'коричневое', 'коричневые']]
];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const cnt = (items: Piece[], r: Role) => items.filter((i) => roleOf(i.category) === r).length;
const lower = (l: string) => l.toLowerCase();

export function analyzeGaps<T extends Piece>(all: T[]): GapReport<T> {
	const core = all.filter((i) => roleOf(i.category));
	const counts: Record<Role, number> = {
		top: cnt(core, 'top'),
		second: cnt(core, 'second'),
		bottom: cnt(core, 'bottom'),
		dress: cnt(core, 'dress'),
		outer: cnt(core, 'outer'),
		shoes: cnt(core, 'shoes')
	};
	if (core.length < 3) return { tooFew: true, counts, bands: [], orphans: [], buy: [] };

	const bands: BandReport[] = BANDS.map((b) => {
		const looks = countLooks(core, b.id, ENOUGH);
		return {
			band: b.id,
			label: b.label,
			hint: b.hint,
			looks,
			level: looks === 0 ? 'none' : looks < FEW ? 'few' : 'ok',
			missing: missingRoles(core, b.id)
		};
	});

	// Вещи без пары. Если образов нет вообще, виноват недостающий слой, а не каждая вещь отдельно.
	const orphans: Orphan<T>[] = [];
	if (bands.some((b) => b.looks > 0)) {
		for (const it of core) {
			if (BANDS.some((b) => hasLookWith(core, b.id, it))) continue;
			const own = roleOf(it.category);
			const lacking = new Set<Role>();
			for (const b of BANDS) {
				if (!eligible(it, b.id, needFor(b.id))) continue;
				for (const r of bands.find((x) => x.band === b.id)!.missing) if (r !== own) lacking.add(r);
			}
			orphans.push({
				item: it,
				why: lacking.size
					? 'Не хватает: ' + [...lacking].map((r) => ROLE_GEN[r]).join(', ')
					: 'Цвет или формальность не сочетаются с остальным'
			});
		}
	}

	return { tooFew: false, counts, bands, orphans, buy: suggestBuys(core, bands, orphans) };
}

function suggestBuys<T extends Piece>(core: T[], bands: BandReport[], orphans: Orphan<T>[]): Buy[] {
	const scored: (Buy & { piece: Piece; raw: number })[] = [];
	for (const c of CANDIDATES) {
		for (const [color, forms] of NEUTRALS) {
			const piece: Piece = { id: '__new', category: c.cat, colors: [color], seasons: [], formality: c.formality, lastWorn: null };
			const next = [...core, piece as T];
			let gain = 0;
			let raw = 0;
			for (const b of bands) {
				const d = Math.min(countLooks(next, b.band, ENOUGH), ENOUGH) - b.looks;
				gain += WEIGHT[b.band] * d;
				raw += d;
			}
			if (gain <= 0) continue;
			scored.push({
				category: c.cat,
				color,
				title: cap(`${forms[c.g]} ${c.noun}`),
				examples: c.examples,
				why: '',
				gain: Math.round(gain),
				piece,
				raw
			});
		}
	}
	scored.sort((a, b) => b.gain - a.gain);

	// По одной вещи на категорию, чтобы список не состоял из пяти вариантов одного и того же
	const seen = new Set<string>();
	const top: typeof scored = [];
	for (const s of scored) {
		if (seen.has(s.category)) continue;
		seen.add(s.category);
		top.push(s);
		if (top.length === 4) break;
	}
	// Если какого-то слоя в гардеробе нет вовсе, он должен попасть в список, даже когда его вес невелик
	for (const role of new Set(bands.flatMap((b) => b.missing))) {
		if (top.length >= 5 || top.some((t) => roleOf(t.category) === role)) continue;
		const best = scored.find((x) => roleOf(x.category) === role);
		if (best) top.push(best);
	}

	return top.map(({ piece, raw, ...b }) => {
		const role = roleOf(b.category)!;
		const lacking = bands.filter((x) => x.missing.includes(role)).map((x) => lower(x.label));
		const unlocks = orphans.filter((o) => BANDS.some((x) => hasLookWith([...core, piece as T], x.id, o.item))).length;
		const parts: string[] = [];
		if (lacking.length) parts.push(`Сейчас нет ${ROLE_GEN[role]} на дни: ${lacking.join(', ')}.`);
		if (unlocks) parts.push(`Вещи без пары заработают: ${unlocks}.`);
		if (!parts.length) parts.push(`Даст ещё ${pluralRu(raw, ['образ', 'образа', 'образов'])} на разную погоду.`);
		return { ...b, why: parts.join(' ') };
	});
}
