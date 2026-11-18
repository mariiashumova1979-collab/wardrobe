import { error } from '@sveltejs/kit';
import { SERPER_API_KEY } from '$app/env/private';
import { buildSearchQuery } from '../query';
import { seenVars } from './diagnostics';
import { mapSerperImages, type Candidate } from './images';

/** Один запрос в Google Images через Serper. Тратит один кредит. */
export async function serperImages(q: string): Promise<Candidate[]> {
	const key = SERPER_API_KEY;
	if (!key) error(500, `SERPER_API_KEY не найден на сервере. ${seenVars()}`);

	let res: Response;
	try {
		res = await fetch('https://google.serper.dev/images', {
			method: 'POST',
			headers: { 'x-api-key': key, 'content-type': 'application/json' },
			body: JSON.stringify({ q: buildSearchQuery(q), gl: 'us', hl: 'en', num: 20 }),
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		error(504, 'Поиск не ответил вовремя');
	}
	if (res.status === 401 || res.status === 403) error(502, 'Serper не принял ключ: проверь SERPER_API_KEY');
	if (res.status === 429) error(429, 'Лимит поиска исчерпан, попробуй позже');
	if (!res.ok) {
		const detail = ((await res.json().catch(() => null)) as { message?: string } | null)?.message?.slice(0, 120);
		error(502, `Ошибка поиска (${res.status})${detail ? ': ' + detail : ''}`);
	}
	return mapSerperImages(await res.json().catch(() => null));
}
