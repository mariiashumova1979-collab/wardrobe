import { error } from '@sveltejs/kit';
import { assertPublicUrl } from '../../../lib/server/guard';
import type { RequestHandler } from './$types';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// Скачивает картинку на сервере, чтобы браузер мог её обработать без ограничений CORS.
export const GET: RequestHandler = async ({ url }) => {
	let target = url.searchParams.get('url') ?? '';
	if (!target) error(400, 'Не указан адрес картинки');

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let u: URL;
		try {
			u = await assertPublicUrl(target);
		} catch (e) {
			error(400, e instanceof Error ? e.message : 'Адрес не разрешён');
		}

		let res: Response;
		try {
			res = await fetch(u, {
				redirect: 'manual',
				signal: AbortSignal.timeout(12_000),
				headers: { accept: 'image/*', 'user-agent': 'Mozilla/5.0 (compatible; WardrobeApp/1.0)' }
			});
		} catch {
			error(502, 'Не удалось скачать картинку');
		}

		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get('location');
			if (!loc) error(502, 'Некорректный редирект');
			target = new URL(loc, u).toString();
			continue; // каждый переход снова проходит проверку адреса
		}
		if (!res.ok) error(502, `Источник ответил ${res.status}`);

		const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
		if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) error(415, 'Это не поддерживаемая картинка');
		if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) error(413, 'Картинка слишком большая');

		const reader = res.body?.getReader();
		if (!reader) error(502, 'Пустой ответ');
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > MAX_BYTES) {
				await reader.cancel();
				error(413, 'Картинка слишком большая');
			}
			chunks.push(value);
		}
		return new Response(new Blob(chunks as BlobPart[], { type }), {
			headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' }
		});
	}
	error(502, 'Слишком много редиректов');
};
