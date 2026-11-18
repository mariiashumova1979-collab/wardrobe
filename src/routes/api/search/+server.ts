import { error, json } from '@sveltejs/kit';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import { mergeCandidates, type Candidate } from '../../../lib/server/images';
import { rankByVision } from '../../../lib/server/rank';
import { serperImages } from '../../../lib/server/serper';
import type { RequestHandler } from './$types';

const clean = (v: string | null, max: number) => (v ?? '').trim().slice(0, max);

export const GET: RequestHandler = async ({ url }) => {
	const q = clean(url.searchParams.get('q'), 200);
	if (!q) error(400, 'Опиши вещь: от 1 до 200 символов');
	// Второй запрос (необязательный): например, описание вещи рядом с поиском по артикулу
	const q2 = clean(url.searchParams.get('q2'), 200);
	// Что именно нужно: по этому тексту Claude проверяет цвет и модель найденных фото
	const about = clean(url.searchParams.get('about'), 300) || q;

	const queries = [q, ...(q2 && q2.toLowerCase() !== q.toLowerCase() ? [q2] : [])];
	const candidates = mergeCandidates(await Promise.all(queries.map(serperImages)));

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
