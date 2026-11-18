import { error, json } from '@sveltejs/kit';
import { skuCore } from '../../../lib/query';
import { askTool, checkImage, type Tool } from '../../../lib/server/claude';
import type { RequestHandler } from './$types';

const SYSTEM = 'Ты помогаешь найти фото вещи из гардероба в англоязычном поиске картинок.';

const TOOL: Tool = {
	name: 'identify_item',
	description: 'Описание вещи и её артикул по фото, бирке или скриншоту.',
	schema: {
		type: 'object',
		properties: {
			brand: { type: 'string', description: 'Бренд, если он виден или напечатан. Иначе пустая строка.' },
			sku: {
				type: 'string',
				description:
					'Артикул или код модели с бирки, этикетки или скриншота. Переписывай символ в символ, ничего не исправляй и не достраивай. Если кода нет — пустая строка.'
			},
			description: {
				type: 'string',
				description:
					'Описание вещи по-английски, 4–10 слов: бренд, модель (например «501 Crop», если она написана или очевидна), тип вещи и ЦВЕТ. Цвет определяй по самой ткани на фото, даже если на бирке его нет. Не выдумывай то, чего не видно.'
			}
		},
		required: ['brand', 'sku', 'description']
	}
};

// По фото, бирке или скриншоту из магазина составляет запросы для поиска.
// Читает напечатанный текст (бренд, артикул) и отдельно описывает вещь с цветом.
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
	if (!body) error(400, 'Ожидался JSON');
	const image = checkImage(body.image);

	const out = await askTool({
		system: SYSTEM,
		tool: TOOL,
		images: [image],
		maxTokens: 300,
		text:
			'На изображении вещь (одежда, обувь, аксессуар): её фото, скриншот из магазина или бирка с этикеткой. ' +
			'Прочитай весь напечатанный текст: бренд, артикул (SKU, код модели, номер товара), название модели. ' +
			'Отдельно определи цвет по ткани. Не выдумывай бренд и код, если их не видно.'
	});

	const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
	const brand = clean(out.brand, 60);
	const sku = clean(out.sku, 60);
	const description = clean(out.description, 160);

	// Артикул надёжнее описания, но без цвета и модели он слеп: поэтому ищем по обоим
	const query = sku ? `${brand} ${skuCore(sku)}`.trim() : description;
	if (!query) error(502, 'Не удалось определить вещь');
	return json({ query, alt: sku ? description : '', brand, sku, description: description || query });
};
