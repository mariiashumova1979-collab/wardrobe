import { error, json } from '@sveltejs/kit';
import { askTool, checkImage, type Tool } from '../../../lib/server/claude';
import { CATS, COLORS, FORMAL, SEASONS, sanitizeAttrs } from '../../../lib/taxonomy';
import type { RequestHandler } from './$types';

const SYSTEM = 'Ты помогаешь вести каталог гардероба. На изображении одна вещь.';

const TOOL: Tool = {
	name: 'save_item',
	description: 'Сохранить описание вещи в каталоге гардероба.',
	schema: {
		type: 'object',
		properties: {
			name: { type: 'string', description: 'Короткое название по-русски, 2–4 слова, без цвета' },
			category: {
				type: 'string',
				enum: CATS.map((c) => c[0]),
				description:
					'Водолазка — тонкий трикотаж с горлом; свитер/джемпер — вязаный трикотаж; худи — с капюшоном; пиджак/жакет — структурный жакет.'
			},
			colors: {
				type: 'array',
				items: { type: 'string', enum: COLORS.map((c) => c[0]) },
				maxItems: 3,
				description: 'Основной цвет первым'
			},
			material: { type: 'string', description: 'Вероятный материал по-русски или пустая строка' },
			seasons: { type: 'array', items: { type: 'string', enum: SEASONS.map((c) => c[0]) } },
			formality: { type: 'string', enum: FORMAL.map((c) => c[0]) }
		},
		required: ['name', 'category', 'colors', 'seasons', 'formality']
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { image?: unknown; hint?: unknown } | null;
	if (!body) error(400, 'Ожидался JSON');
	const image = checkImage(body.image);
	const hint = typeof body.hint === 'string' ? body.hint.trim().slice(0, 200) : '';

	const text =
		'Определи вещь на изображении и сохрани её описание.' +
		(hint ? ` Пользователь описала вещь так: «${hint}». Учти это, если не противоречит изображению.` : '');

	return json(sanitizeAttrs(await askTool({ system: SYSTEM, text, imageDataUrl: image, tool: TOOL })));
};
