// Погода для подбора комплектов: Open-Meteo, без ключа, запрос идёт прямо из браузера.

export const PLACE = { name: 'Лимассол', lat: 34.6841, lon: 33.0379 };

export type Weather = {
	fetchedAt: number;
	tempNow: number;
	feelsNow: number;
	min: number;
	max: number;
	feelsMin: number;
	feelsMax: number;
	/** Вероятность осадков за день, %. */
	rainChance: number;
	rainMm: number;
	code: number;
	wind: number;
};

export const weatherUrl = () =>
	'https://api.open-meteo.com/v1/forecast' +
	`?latitude=${PLACE.lat}&longitude=${PLACE.lon}` +
	'&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
	'&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max' +
	'&timezone=auto&forecast_days=1';

const num = (v: unknown): number => {
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Неожиданный ответ погоды');
	return v;
};
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function parseWeather(raw: unknown, now = Date.now()): Weather {
	const r = raw as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> } | null;
	const c = r?.current;
	const d = r?.daily;
	if (!c || !d) throw new Error('Неожиданный ответ погоды');
	const day = (k: string) => d[k]?.[0];
	return {
		fetchedAt: now,
		tempNow: num(c.temperature_2m),
		feelsNow: num(c.apparent_temperature),
		min: num(day('temperature_2m_min')),
		max: num(day('temperature_2m_max')),
		feelsMin: num(day('apparent_temperature_min')),
		feelsMax: num(day('apparent_temperature_max')),
		// вероятность осадков бывает null, если модель её не считает
		rainChance: numOr(day('precipitation_probability_max'), 0),
		rainMm: numOr(day('precipitation_sum'), 0),
		code: numOr(c.weather_code, 0),
		wind: numOr(c.wind_speed_10m, 0)
	};
}

/** Температура, по которой выбираем одежду: середина дня по ощущению (макс. и мин.). */
export const referenceTemp = (w: Weather) => Math.round((w.feelsMax + w.feelsMin) / 2);

export const isRainy = (w: Weather) => w.rainChance >= 50 || w.rainMm >= 1;

export function describeCode(code: number): string {
	if (code === 0) return 'Ясно';
	if (code === 1) return 'Почти ясно';
	if (code === 2) return 'Переменная облачность';
	if (code === 3) return 'Пасмурно';
	if (code === 45 || code === 48) return 'Туман';
	if (code >= 51 && code <= 57) return 'Морось';
	if (code >= 61 && code <= 67) return 'Дождь';
	if (code >= 71 && code <= 77) return 'Снег';
	if (code >= 80 && code <= 82) return 'Ливни';
	if (code === 85 || code === 86) return 'Снегопад';
	if (code >= 95) return 'Гроза';
	return 'Облачно';
}

const KEY = 'wardrobe-weather-v1';
const FRESH = 30 * 60_000;
const STALE_OK = 12 * 3_600_000;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Свежий кэш → сеть → старый кэш (до 12 часов). Без сети и без кэша — ошибка. */
export async function loadWeather(
	o: { fetchFn?: typeof fetch; storage?: Store; now?: number } = {}
): Promise<{ weather: Weather; stale: boolean }> {
	const now = o.now ?? Date.now();
	const storage = o.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
	let cached: Weather | null = null;
	try {
		const s = storage?.getItem(KEY);
		if (s) cached = parseWeather({ ...JSON.parse(s).raw }, JSON.parse(s).fetchedAt);
	} catch {
		cached = null;
	}
	if (cached && now - cached.fetchedAt < FRESH) return { weather: cached, stale: false };
	try {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), 8000);
		const res = await (o.fetchFn ?? fetch)(weatherUrl(), { signal: ctl.signal }).finally(() => clearTimeout(timer));
		if (!res.ok) throw new Error('HTTP ' + res.status);
		const raw = await res.json();
		const weather = parseWeather(raw, now);
		try {
			storage?.setItem(KEY, JSON.stringify({ fetchedAt: now, raw }));
		} catch {
			/* кэш необязателен */
		}
		return { weather, stale: false };
	} catch (e) {
		if (cached && now - cached.fetchedAt < STALE_OK) return { weather: cached, stale: true };
		throw e;
	}
}
