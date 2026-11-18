import { error, json } from '@sveltejs/kit';
import { askTool, checkImage, type Tool } from '../../../lib/server/claude';
import type { RequestHandler } from './$types';

const SYSTEM = 'Ты помогаешь найти фото вещи из гардероба в англоязычном поиске картинок.';

const TOOL: Tool = {
	name: 'search_query',
	description: 'Поисковый запрос для поиска фото вещи.',
	schema: {
		type: 'object',
		properties: {
			brand: { type: 'string', description: 'Бренд, если он виден или напечатан. Иначе пустая строка.' },
			sku: {
				type: 'string',
				description:
					'Артикул или код модели с бирки, этикетки или скриншота. Переписывай символ в символ, ничего не исправляй и не достраивай. Если кода нет — пустая строка.'
			},
			query: {
				type: 'string',
				description:
					'Поисковый запрос по-английски. Если есть артикул: бренд + артикул. Иначе 3–8 слов: бренд (если виден), тип вещи, цвет, крой или материал.'
			}
		},
		required: ['brand', 'sku', 'query']
	}
};

// По фото, бирке или скриншоту из магазина составляет поисковый запрос.
// Сначала читает любой напечатанный текст (бренд, артикул), и только потом описывает вещь.
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
			'Сначала прочитай весь напечатанный текст: бренд и артикул (SKU, код модели, номер товара). ' +
			'Не выдумывай бренд и код, если их не видно. Затем составь запрос для поиска фото этой вещи.'
	});

	const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
	const brand = clean(out.brand, 60);
	const sku = clean(out.sku, 60);
	// Артикул надёжнее любого описания: если он прочитан, ищем по нему.
	const query = sku ? `${brand} ${sku}`.trim() : clean(out.query, 120);
	if (!query) error(502, 'Не удалось определить вещь');
	return json({ query, brand, sku });
};
