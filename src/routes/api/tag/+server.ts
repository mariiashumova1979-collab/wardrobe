import { error, json } from '@sveltejs/kit';
import { askJson, checkImage } from '../../../lib/server/claude';
import { CATS, COLORS, FORMAL, SEASONS, sanitizeAttrs } from '../../../lib/taxonomy';
import type { RequestHandler } from './$types';

const SYSTEM =
	'Ты помогаешь вести каталог гардероба. На фото одна вещь. Отвечай только JSON, без пояснений и markdown.';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { image?: unknown; hint?: unknown } | null;
	if (!body) error(400, 'Ожидался JSON');
	const image = checkImage(body.image);
	const hint = typeof body.hint === 'string' ? body.hint.trim().slice(0, 200) : '';

	const text =
		'Определи вещь на фото и верни JSON такого вида:\n' +
		'{"name":"короткое название по-русски, 2–4 слова, без цвета",' +
		`"category":"один из: ${CATS.map((c) => c[0]).join(', ')}",` +
		`"colors":["до трёх из: ${COLORS.map((c) => c[0]).join(', ')}; основной цвет первым"],` +
		'"material":"вероятный материал по-русски или пустая строка",' +
		`"seasons":["подходящие из: ${SEASONS.map((c) => c[0]).join(', ')}"],` +
		`"formality":"один из: ${FORMAL.map((c) => c[0]).join(', ')}"}\n` +
		'Подсказки: водолазка — тонкий трикотаж с горлом; свитер/джемпер — вязаный трикотаж; ' +
		'худи — с капюшоном; пиджак/жакет — структурный жакет.' +
		(hint ? `\nПользователь описала вещь так: «${hint}». Учти это, если не противоречит фото.` : '');

	const raw = await askJson({ system: SYSTEM, text, imageDataUrl: image });
	return json(sanitizeAttrs(raw));
};
