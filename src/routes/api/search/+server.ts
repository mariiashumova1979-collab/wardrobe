import { error, json } from '@sveltejs/kit';
import { ANTHROPIC_API_KEY, SERPER_API_KEY } from '$app/env/private';
import { buildSearchQuery } from '../../../lib/query';
import { mapSerperImages, type Candidate } from '../../../lib/server/images';
import { rankByVision } from '../../../lib/server/rank';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length > 200) error(400, 'Опиши вещь: от 1 до 200 символов');
	// Как человек описал вещь: по этому тексту Claude проверяет цвет и модель найденных фото
	const about = (url.searchParams.get('about') ?? q).trim().slice(0, 200);
	const key = SERPER_API_KEY;
	if (!key) error(500, 'SERPER_API_KEY не задан');

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

	const candidates = mapSerperImages(await res.json().catch(() => null));

	let results: Candidate[] = candidates.slice(0, 12);
	let ranked = false;
	if (candidates.length > 1 && ANTHROPIC_API_KEY) {
		try {
			results = await rankByVision(candidates, about);
			ranked = true;
		} catch (e) {
			// без отбора поиск всё равно работает: покажем как пришло
			console.error('Отбор фото не удался', e instanceof Error ? e.message : e);
		}
	}
	return json({ results, ranked });
};
