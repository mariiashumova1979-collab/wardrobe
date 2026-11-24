import { error } from '@sveltejs/kit';
import { MAX_PHOTO, PHOTO_KEY, PHOTO_TYPES } from '../../../../lib/server/sync';
import { getStore } from '../../../../lib/server/syncstore';
import type { RequestHandler } from './$types';

function setup(url: URL) {
	const s = getStore();
	if (!s) error(501, 'Синхронизация не настроена: подключи хранилище Vercel Blob к проекту');
	const key = url.searchParams.get('key') ?? '';
	if (!PHOTO_KEY.test(key)) error(400, 'Неверный ключ фото');
	return { s, key };
}

export const GET: RequestHandler = async ({ url }) => {
	const { s, key } = setup(url);
	const photo = await s.readPhoto(key).catch(() => error(502, 'Хранилище синхронизации не ответило'));
	if (!photo) error(404, 'Фото не найдено');
	return new Response(Buffer.from(photo.bytes), {
		// ключ меняется вместе с фото, поэтому кэшировать можно навсегда
		headers: { 'content-type': photo.type, 'cache-control': 'private, max-age=31536000, immutable' }
	});
};

export const PUT: RequestHandler = async ({ url, request }) => {
	const { s, key } = setup(url);
	const type = (request.headers.get('content-type') ?? '').split(';')[0].trim();
	if (!PHOTO_TYPES.has(type)) error(415, 'Нужно изображение png, jpeg или webp');
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (!bytes.length) error(400, 'Пустое фото');
	if (bytes.length > MAX_PHOTO) error(413, 'Фото слишком большое');
	await s.writePhoto(key, bytes, type).catch(() => error(502, 'Хранилище синхронизации не ответило'));
	return new Response(null, { status: 204 });
};
