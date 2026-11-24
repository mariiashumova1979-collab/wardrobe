import { describe, expect, it } from 'vitest';
import { describeCode, isRainy, loadForecast, parseForecast, referenceTemp, upcoming, weatherUrl } from './weather';

const raw = (over: Record<string, unknown> = {}) => ({
	current: { temperature_2m: 17.4, apparent_temperature: 15.9, weather_code: 3, wind_speed_10m: 12.1 },
	daily: {
		time: ['2026-11-24', '2026-11-25', '2026-11-26'],
		weather_code: [3, 61, 0],
		temperature_2m_max: [19.2, 17, 22],
		temperature_2m_min: [11.8, 10, 12],
		apparent_temperature_max: [18.1, 15, 21],
		apparent_temperature_min: [10.3, 8, 11],
		precipitation_sum: [0.2, 5, 0],
		precipitation_probability_max: [35, 80, null]
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

describe('прогноз погоды', () => {
	it('запрос идёт в Лимассол на 7 дней и просит нужные поля', () => {
		const u = weatherUrl();
		expect(u).toContain('latitude=34.6841');
		expect(u).toContain('longitude=33.0379');
		expect(u).toContain('forecast_days=7');
		for (const f of ['apparent_temperature_max', 'apparent_temperature_min', 'precipitation_probability_max', 'weather_code']) {
			expect(u).toContain(f);
		}
	});
	it('разбирает дни и текущую погоду', () => {
		const f = parseForecast(raw(), 1000);
		expect(f.fetchedAt).toBe(1000);
		expect(f.now).toMatchObject({ temp: 17.4, feels: 15.9, code: 3 });
		expect(f.days).toHaveLength(3);
		expect(f.days[0]).toMatchObject({ date: '2026-11-24', feelsMax: 18.1, feelsMin: 10.3, rainChance: 35, code: 3 });
		expect(f.days[1]).toMatchObject({ date: '2026-11-25', rainChance: 80, code: 61 });
		expect(referenceTemp(f.days[0])).toBe(14);
	});
	it('вероятность осадков null не ломает разбор', () => {
		expect(parseForecast(raw()).days[2].rainChance).toBe(0);
	});
	it('дальние дни без данных отбрасываются, а не ломают прогноз', () => {
		const r = raw();
		(r.daily as Record<string, unknown[]>).temperature_2m_max = [19.2, null, 22];
		expect(parseForecast(r).days.map((d) => d.date)).toEqual(['2026-11-24']);
	});
	it('дождь по вероятности или по количеству', () => {
		const [a, b] = parseForecast(raw()).days;
		expect(isRainy(a)).toBe(false);
		expect(isRainy(b)).toBe(true);
		expect(isRainy({ ...a, rainMm: 2 })).toBe(true);
	});
	it('чужой формат — ошибка', () => {
		expect(() => parseForecast({})).toThrow();
		expect(() => parseForecast(raw({ daily: { time: [] } }))).toThrow();
		expect(() => parseForecast(raw({ daily: { time: ['2026-11-24'], temperature_2m_max: [] } }))).toThrow();
	});
	it('прошедшие дни в кэше отбрасываются', () => {
		const f = parseForecast(raw());
		expect(upcoming(f, '2026-11-25').map((d) => d.date)).toEqual(['2026-11-25', '2026-11-26']);
		expect(upcoming(f, '2026-12-01')).toEqual([]);
	});
	it('описания по коду', () => {
		expect(describeCode(0)).toBe('Ясно');
		expect(describeCode(63)).toBe('Дождь');
		expect(describeCode(95)).toBe('Гроза');
	});
	it('кэш: свежий не перезапрашивается, при сбое сети отдаётся старый', async () => {
		const storage = memory();
		const a = await loadForecast({ fetchFn: okFetch(raw()), storage, now: 0 });
		expect(a.stale).toBe(false);
		const b = await loadForecast({ fetchFn: failFetch, storage, now: 10 * 60_000 });
		expect(b.stale).toBe(false);
		const c = await loadForecast({ fetchFn: failFetch, storage, now: 2 * 3_600_000 });
		expect(c.stale).toBe(true);
		expect(c.forecast.days[0].feelsMax).toBe(18.1);
		await expect(loadForecast({ fetchFn: failFetch, storage, now: 13 * 3_600_000 })).rejects.toThrow();
		await expect(loadForecast({ fetchFn: failFetch, storage: memory(), now: 0 })).rejects.toThrow();
	});
});
