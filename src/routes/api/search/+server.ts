import { error, json } from '@sveltejs/kit';
import { BRAVE_API_KEY } from '$app/env/private';
import { buildSearchQuery } from '../../../lib/query';
import type { RequestHandler } from './$types';

type BraveImage = {
	title?: string;
	source?: string;
	url?: string;
	thumbnail?: { src?: string };
	properties?: { url?: string; width?: number; height?: number };
};

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length > 200) error(400, 'Опиши вещь: от 1 до 200 символов');
	const key = BRAVE_API_KEY;
	if (!key) error(500, 'BRAVE_API_KEY не задан');

	const api = new URL('https://api.search.brave.com/res/v1/images/search');
	api.searchParams.set('q', buildSearchQuery(q));
	api.searchParams.set('count', '30');
	api.searchParams.set('safesearch', 'strict');
	// Автокоррекция портит бренды и артикулы («2753/401» → что-то другое).
	api.searchParams.set('spellcheck', 'false');

	let res: Response;
	try {
		res = await fetch(api, {
			headers: { accept: 'application/json', 'x-subscription-token': key },
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		error(504, 'Поиск не ответил вовремя');
	}
	if (res.status === 429) error(429, 'Лимит поиска исчерпан, попробуй позже');
	if (!res.ok) error(502, `Ошибка поиска (${res.status})`);

	const data = (await res.json()) as { results?: BraveImage[] };
	const results = (data.results ?? [])
		.filter((r) => r.properties?.url)
		.slice(0, 12)
		.map((r, i) => ({
			id: String(i),
			title: r.title ?? '',
			source: r.source ?? '',
			thumb: r.thumbnail?.src ?? r.properties!.url!,
			full: r.properties!.url!,
			width: r.properties?.width ?? null,
			height: r.properties?.height ?? null
		}));
	return json({ results });
};
