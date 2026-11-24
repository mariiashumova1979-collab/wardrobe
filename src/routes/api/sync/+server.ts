import { error, json } from '@sveltejs/kit';
import { parseState } from '../../../lib/syncstate';
import { MAX_STATE, syncState } from '../../../lib/server/sync';
import { getStore } from '../../../lib/server/syncstore';
import type { RequestHandler } from './$types';

function store() {
	const s = getStore();
	if (!s) error(501, 'Синхронизация не настроена: подключи хранилище Vercel Blob к проекту');
	return s;
}

async function answer(incoming: ReturnType<typeof parseState> | null) {
	const s = store();
	try {
		const state = await syncState(s, incoming);
		// какие фото уже лежат в хранилище: клиент загрузит только недостающие
		return json({ state, photos: await s.listPhotos() });
	} catch (e) {
		console.error('sync failed', e);
		error(502, e instanceof Error && e.message.startsWith('Слишком') ? e.message : 'Хранилище синхронизации не ответило');
	}
}

export const GET: RequestHandler = () => answer(null);

export const PUT: RequestHandler = async ({ request }) => {
	const text = await request.text();
	if (text.length > MAX_STATE) error(413, 'Слишком большой объём данных');
	let state;
	try {
		state = parseState(JSON.parse(text));
	} catch {
		error(400, 'Неверный формат данных');
	}
	return answer(state);
};
