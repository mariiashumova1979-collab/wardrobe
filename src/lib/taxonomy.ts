// Общие справочники: используются и на клиенте, и на сервере.

export type Attrs = {
	name: string;
	/** Бренд; у вещей, добавленных раньше, пустая строка. */
	brand: string;
	category: string;
	colors: string[];
	material: string;
	seasons: string[];
	formality: string;
};

export const CATS: [string, string][] = [
	['top', 'Футболка / топ'],
	['shirt', 'Рубашка / блуза'],
	['turtleneck', 'Водолазка'],
	['sweater', 'Свитер / джемпер'],
	['cardigan', 'Кардиган'],
	['hoodie', 'Худи'],
	['blazer', 'Пиджак / жакет'],
	['outer', 'Куртка / пальто'],
	['pants', 'Брюки'],
	['jeans', 'Джинсы'],
	['skirt', 'Юбка'],
	['dress', 'Платье'],
	['shorts', 'Шорты'],
	['shoes', 'Обувь'],
	['bag', 'Сумка'],
	['backpack', 'Рюкзак'],
	['acc', 'Аксессуар']
];

// Второй слой — только эти категории (не куртки, не бомберы, не овершоты).
export const SECOND_LAYER = new Set(['turtleneck', 'sweater', 'cardigan', 'hoodie', 'blazer']);

export const COLORS: [string, string, string][] = [
	['black', 'Чёрный', '#1c1c1c'],
	['white', 'Белый', '#f4f1ea'],
	['grey', 'Серый', '#9a9a9a'],
	['beige', 'Бежевый', '#d8c3a0'],
	['brown', 'Коричневый', '#7a5232'],
	['navy', 'Тёмно-синий', '#1f2f55'],
	['blue', 'Синий / голубой', '#4c7bbf'],
	['green', 'Зелёный', '#4f7a50'],
	['olive', 'Оливковый', '#7a7a3a'],
	['red', 'Красный', '#b8322a'],
	['burgundy', 'Бордовый', '#6d1f2f'],
	['pink', 'Розовый', '#e3a1b5'],
	['yellow', 'Жёлтый', '#e0b93a'],
	['orange', 'Оранжевый', '#d9792b'],
	['purple', 'Фиолетовый', '#7b5ea7'],
	[
		'multi',
		'Принт / мультицвет',
		'conic-gradient(#d9792b,#e0b93a,#4f7a50,#4c7bbf,#7b5ea7,#b8322a,#d9792b)'
	]
];

export const SEASONS: [string, string][] = [
	['spring', 'Весна'],
	['summer', 'Лето'],
	['autumn', 'Осень'],
	['winter', 'Зима']
];

export const FORMAL: [string, string][] = [
	['casual', 'Повседневный'],
	['smart', 'Смарт-кэжуал'],
	['business', 'Деловой'],
	['evening', 'Вечерний'],
	['sport', 'Спорт']
];

export const catLabel = (k: string) => CATS.find((c) => c[0] === k)?.[1] ?? '—';
export const layerOf = (k: string): 'second' | 'outer' | 'base' =>
	SECOND_LAYER.has(k) ? 'second' : k === 'outer' ? 'outer' : 'base';

export function pluralRu(n: number, f: [string, string, string]) {
	const a = Math.abs(n) % 100;
	const b = a % 10;
	return `${n} ${a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]}`;
}

/** Приводит ответ модели к допустимым значениям — всё лишнее отбрасывается. */
export function sanitizeAttrs(raw: unknown): Partial<Attrs> {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const keys = (l: readonly (readonly string[])[]) => new Set(l.map((x) => x[0]));
	const list = (v: unknown, allowed: Set<string>, max: number) =>
		Array.isArray(v)
			? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.has(x)))].slice(0, max)
			: undefined;
	const out: Partial<Attrs> = {};
	if (typeof r.name === 'string') out.name = r.name.trim().slice(0, 60);
	if (typeof r.brand === 'string') out.brand = r.brand.trim().slice(0, 40);
	if (typeof r.category === 'string' && keys(CATS).has(r.category)) out.category = r.category;
	const colors = list(r.colors, keys(COLORS), 3);
	if (colors) out.colors = colors;
	if (typeof r.material === 'string') out.material = r.material.trim().slice(0, 40);
	const seasons = list(r.seasons, keys(SEASONS), 4);
	if (seasons) out.seasons = seasons;
	if (typeof r.formality === 'string' && keys(FORMAL).has(r.formality)) out.formality = r.formality;
	return out;
}
