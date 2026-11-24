import { describe, expect, it } from 'vitest';
import { describeCode, isRainy, loadWeather, parseWeather, referenceTemp, weatherUrl } from './weather';

const raw = (over: Record<string, unknown> = {}) => ({
	current: { temperature_2m: 17.4, apparent_temperature: 15.9, weather_code: 3, wind_speed_10m: 12.1 },
	daily: {
		temperature_2m_max: [19.2],
		temperature_2m_min: [11.8],
		apparent_temperature_max: [18.1],
		apparent_temperature_min: [10.3],
		precipitation_sum: [0.2],
		precipitation_probability_max: [35]
	},
	...over
});

const memory = () => {
	const m = new Map<string, string>();
	return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const okFetch = (body: unknown) => (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
const failFetch = (async () => {
	throw new Error('offline');
}) as unknown as typeof fetch;

describe('погода', () => {
	it('запрос идёт в Лимассол и просит нужные поля', () => {
		const u = weatherUrl();
		expect(u).toContain('latitude=34.6841');
		expect(u).toContain('longitude=33.0379');
		for (const f of ['apparent_temperature_max', 'apparent_temperature_min', 'precipitation_probability_max', 'weather_code']) {
			expect(u).toContain(f);
		}
	});
	it('разбирает ответ', () => {
		const w = parseWeather(raw(), 1000);
		expect(w).toMatchObject({ tempNow: 17.4, feelsMax: 18.1, feelsMin: 10.3, rainChance: 35, code: 3, fetchedAt: 1000 });
		expect(referenceTemp(w)).toBe(14);
		expect(isRainy(w)).toBe(false);
	});
	it('вероятность осадков null не ломает разбор', () => {
		const r = raw();
		(r.daily as Record<string, unknown[]>).precipitation_probability_max = [null];
		expect(parseWeather(r).rainChance).toBe(0);
	});
	it('дождь по вероятности или по количеству', () => {
		expect(isRainy({ ...parseWeather(raw()), rainChance: 60 })).toBe(true);
		expect(isRainy({ ...parseWeather(raw()), rainMm: 2 })).toBe(true);
	});
	it('чужой формат — ошибка', () => {
		expect(() => parseWeather({})).toThrow();
		expect(() => parseWeather(raw({ daily: { temperature_2m_max: [] } }))).toThrow();
	});
	it('описания по коду', () => {
		expect(describeCode(0)).toBe('Ясно');
		expect(describeCode(63)).toBe('Дождь');
		expect(describeCode(95)).toBe('Гроза');
	});
	it('кэш: свежий не перезапрашивается, при сбое сети отдаётся старый', async () => {
		const storage = memory();
		const a = await loadWeather({ fetchFn: okFetch(raw()), storage, now: 0 });
		expect(a.stale).toBe(false);
		const b = await loadWeather({ fetchFn: failFetch, storage, now: 10 * 60_000 });
		expect(b).toMatchObject({ stale: false });
		const c = await loadWeather({ fetchFn: failFetch, storage, now: 2 * 3_600_000 });
		expect(c.stale).toBe(true);
		expect(c.weather.feelsMax).toBe(18.1);
		await expect(loadWeather({ fetchFn: failFetch, storage, now: 13 * 3_600_000 })).rejects.toThrow();
		await expect(loadWeather({ fetchFn: failFetch, storage: memory(), now: 0 })).rejects.toThrow();
	});
});
