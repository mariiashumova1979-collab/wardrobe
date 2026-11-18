import { error, json } from '@sveltejs/kit';
import { askTool, type Tool } from '../../../lib/server/claude';
import type { RequestHandler } from './$types';

const SYSTEM = 'Ты помогаешь найти фото вещи из гардероба в англоязычном поиске картинок.';

const TOOL: Tool = {
	name: 'search_query',
	description: 'Поисковый запрос для поиска фото вещи.',
	schema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description:
					'Запрос по-английски, 3–8 слов: бренд (если назван), тип вещи, цвет, крой или материал. Бренды, названия моделей и артикулы — дословно, как в описании.'
			}
		},
		required: ['query']
	}
};

// Переводит русское описание вещи в хороший английский запрос: поиск картинок
// работает заметно лучше на английском и на «чистых» словах, чем на разговорной фразе.
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
	const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 200) : '';
	if (!text) error(400, 'Опиши вещь');

	const out = await askTool({
		system: SYSTEM,
		tool: TOOL,
		maxTokens: 150,
		text:
			`Описание вещи: «${text}»\n` +
			'Составь поисковый запрос. Ничего не добавляй от себя: не выдумывай бренд, цвет или крой, которых нет в описании.'
	});
	const query = typeof out.query === 'string' ? out.query.trim().slice(0, 120) : '';
	if (!query) error(502, 'Не удалось составить запрос');
	return json({ query });
};
