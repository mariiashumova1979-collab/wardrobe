import { askTool, type Tool } from './claude';
import { assertPublicUrl } from './guard';
import { parseRatings, rankCandidates, type Candidate } from './images';

const MAX_THUMBS = 16;
const MAX_THUMB_BYTES = 400_000;

const TOOL: Tool = {
	name: 'rate_images',
	description: 'Оценить, подходят ли найденные фото под описание вещи.',
	schema: {
		type: 'object',
		properties: {
			ratings: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						index: { type: 'integer', description: 'Номер изображения' },
						fit: {
							type: 'integer',
							minimum: 0,
							maximum: 10,
							description:
								'Насколько на фото именно эта вещь: тип, цвет, модель. Другой цвет или другая вещь — не больше 3.'
						},
						person: {
							type: 'boolean',
							description: 'true, если вещь надета на человеке или в руках; false, если вещь снята отдельно.'
						}
					},
					required: ['index', 'fit', 'person']
				}
			}
		},
		required: ['ratings']
	}
};

/** Качает миниатюру на сервере; любая неудача — просто null, это не повод ронять поиск. */
async function thumbDataUrl(url: string): Promise<string | null> {
	try {
		const u = await assertPublicUrl(url);
		const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(3500), headers: { accept: 'image/*' } });
		const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
		if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length === 0 || buf.length > MAX_THUMB_BYTES) return null;
		return `data:${type};base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}

/**
 * Просит Claude посмотреть на миниатюры и оценить их. Возвращает отсортированные варианты.
 * Кому не удалось скачать миниатюру, тот остаётся без оценки и показывается как есть.
 */
export async function rankByVision(items: Candidate[], about: string, timeoutMs = 9000): Promise<Candidate[]> {
	const head = items.slice(0, MAX_THUMBS);
	const loaded = (await Promise.all(head.map((c) => thumbDataUrl(c.thumb)))).map((data, i) => ({ data, i }));
	const usable = loaded.filter((x): x is { data: string; i: number } => x.data !== null);
	if (usable.length < 2) return items.slice(0, 12);

	const out = await askTool({
		system: 'Ты помогаешь выбрать подходящее фото вещи для каталога гардероба.',
		tool: TOOL,
		images: usable.map((x) => x.data),
		maxTokens: 700,
		timeoutMs,
		text:
			`Нужна вещь: «${about}».\n` +
			'Оцени каждое изображение. Цвет и модель должны совпадать с описанием: ' +
			'если, например, нужны бежевые джинсы, а на фото голубые, это не подходит. ' +
			'Номер в ответе — это номер из подписи «Изображение N».'
	});

	// оценки пришли по номерам в списке usable; возвращаем их на места исходных кандидатов
	const ratings = parseRatings(out, usable.length).map((r) => ({ ...r, index: usable[r.index].i }));
	return rankCandidates(items, ratings);
}
