import { error, json } from '@sveltejs/kit';
import { askTool, checkImage, type Tool } from '../../../lib/server/claude';
import { sanitizeBox } from '../../../lib/server/images';
import type { RequestHandler } from './$types';

const TOOL: Tool = {
	name: 'locate_item',
	description: 'Рамка вокруг нужной вещи на изображении.',
	schema: {
		type: 'object',
		properties: {
			found: { type: 'boolean', description: 'Есть ли на изображении эта вещь' },
			x1: { type: 'integer', minimum: 0, maximum: 1000, description: 'Левый край, 0–1000 слева направо' },
			y1: { type: 'integer', minimum: 0, maximum: 1000, description: 'Верхний край, 0–1000 сверху вниз' },
			x2: { type: 'integer', minimum: 0, maximum: 1000, description: 'Правый край' },
			y2: { type: 'integer', minimum: 0, maximum: 1000, description: 'Нижний край' }
		},
		required: ['found', 'x1', 'y1', 'x2', 'y2']
	}
};

// Если на фото человек в нескольких вещах, находит рамку только вокруг нужной.
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { image?: unknown; about?: unknown } | null;
	if (!body) error(400, 'Ожидался JSON');
	const image = checkImage(body.image);
	const about = typeof body.about === 'string' ? body.about.trim().slice(0, 200) : '';

	const out = await askTool({
		system: 'Ты помогаешь вырезать одну вещь из фото для каталога гардероба.',
		tool: TOOL,
		images: [image],
		maxTokens: 200,
		text:
			`Найди на изображении вещь: «${about || 'главная вещь одежды'}». ` +
			'Верни рамку вокруг только этой вещи, без остальной одежды, головы и фона. ' +
			'Координаты от 0 до 1000, начало в левом верхнем углу.'
	});
	return json({ box: sanitizeBox(out) });
};
