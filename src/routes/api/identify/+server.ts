import { error, json } from '@sveltejs/kit';
import { askJson, checkImage } from '../../../lib/server/claude';
import type { RequestHandler } from './$types';

const SYSTEM =
	'Ты помогаешь найти фото вещи в интернете. Отвечай только JSON, без пояснений и markdown.';

// По своему фото или скриншоту из магазина составляет поисковый запрос.
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
	if (!body) error(400, 'Ожидался JSON');
	const image = checkImage(body.image);

	const raw = (await askJson({
		system: SYSTEM,
		imageDataUrl: image,
		maxTokens: 120,
		text:
			'Определи вещь на изображении (это может быть фото или скриншот из магазина). ' +
			'Составь короткий запрос для поиска её фото в интернете: бренд, если он виден, тип вещи, цвет, крой. ' +
			'3–7 слов. Верни JSON: {"query":"..."}'
	})) as { query?: unknown };

	const query = typeof raw?.query === 'string' ? raw.query.trim().slice(0, 120) : '';
	if (!query) error(502, 'Не удалось определить вещь');
	return json({ query });
};
