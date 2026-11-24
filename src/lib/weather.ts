// Погода для подбора комплектов: Open-Meteo, без ключа, запрос идёт прямо из браузера.

export const PLACE = { name: 'Лимассол', lat: 34.6841, lon: 33.0379 };
export const FORECAST_DAYS = 7;

/** Один день прогноза. Температуры «ощущается» важнее обычных: по ним выбирается одежда. */
export type Day = {
	/** ГГГГ-ММ-ДД в часовом поясе места. */
	date: string;
	min: number;
	max: number;
	feelsMin: number;
	feelsMax: number;
	/** Вероятность осадков за день, %. */
	rainChance: number;
	rainMm: number;
	code: number;
};
export type Now = { temp: number; feels: number; code: number; wind: number };
export type Forecast = { fetchedAt: number; now: Now; days: Day[] };

export const weatherUrl = () =>
	'https://api.open-meteo.com/v1/forecast' +
	`?latitude=${PLACE.lat}&longitude=${PLACE.lon}` +
	'&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
	'&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max' +
	`&timezone=auto&forecast_days=${FORECAST_DAYS}`;

const num = (v: unknown): number => {
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Неожиданный ответ погоды');
	return v;
};
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function parseForecast(raw: unknown, now = Date.now()): Forecast {
	const r = raw as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> } | null;
	const c = r?.current;
	const d = r?.daily;
	if (!c || !d || !Array.isArray(d.time) || !d.time.length) throw new Error('Неожиданный ответ погоды');

	const days: Day[] = [];
	for (let i = 0; i < d.time.length; i++) {
		try {
			const date = d.time[i];
			if (typeof date !== 'string') throw new Error();
			days.push({
				date,
				min: num(d.temperature_2m_min?.[i]),
				max: num(d.temperature_2m_max?.[i]),
				feelsMin: num(d.apparent_temperature_min?.[i]),
				feelsMax: num(d.apparent_temperature_max?.[i]),
				// у дальних дней вероятность осадков бывает null
				rainChance: numOr(d.precipitation_probability_max?.[i], 0),
				rainMm: numOr(d.precipitation_sum?.[i], 0),
				code: numOr(d.weather_code?.[i], 0)
			});
		} catch (e) {
			// первый день обязателен, у дальних данных может не быть
			if (i === 0) throw e instanceof Error && e.message ? e : new Error('Неожиданный ответ погоды');
			break;
		}
	}
	return {
		fetchedAt: now,
		now: { temp: num(c.temperature_2m), feels: num(c.apparent_temperature), code: numOr(c.weather_code, 0), wind: numOr(c.wind_speed_10m, 0) },
		days
	};
}

/** Температура, по которой выбираем одежду: середина дня по ощущению (макс. и мин.). */
export const referenceTemp = (w: Day) => Math.round((w.feelsMax + w.feelsMin) / 2);

export const isRainy = (w: Day) => w.rainChance >= 50 || w.rainMm >= 1;

/** Дни не раньше сегодняшнего: закэшированный прогноз мог начаться вчера. */
export const upcoming = (f: Forecast, today: string) => f.days.filter((d) => d.date >= today);

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

const KEY = 'wardrobe-weather-v2';
const FRESH = 30 * 60_000;
const STALE_OK = 12 * 3_600_000;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Свежий кэш → сеть → старый кэш (до 12 часов). Без сети и без кэша — ошибка. */
export async function loadForecast(
	o: { fetchFn?: typeof fetch; storage?: Store; now?: number } = {}
): Promise<{ forecast: Forecast; stale: boolean }> {
	const now = o.now ?? Date.now();
	const storage = o.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
	let cached: Forecast | null = null;
	try {
		const s = storage?.getItem(KEY);
		if (s) {
			const j = JSON.parse(s) as { fetchedAt: number; raw: unknown };
			cached = parseForecast(j.raw, j.fetchedAt);
		}
	} catch {
		cached = null;
	}
	if (cached && now - cached.fetchedAt < FRESH) return { forecast: cached, stale: false };
	try {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), 8000);
		const res = await (o.fetchFn ?? fetch)(weatherUrl(), { signal: ctl.signal }).finally(() => clearTimeout(timer));
		if (!res.ok) throw new Error('HTTP ' + res.status);
		const raw = await res.json();
		const forecast = parseForecast(raw, now);
		try {
			storage?.setItem(KEY, JSON.stringify({ fetchedAt: now, raw }));
		} catch {
			/* кэш необязателен */
		}
		return { forecast, stale: false };
	} catch (e) {
		if (cached && now - cached.fetchedAt < STALE_OK) return { forecast: cached, stale: true };
		throw e;
	}
}
