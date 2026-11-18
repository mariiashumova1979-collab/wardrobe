import { error } from '@sveltejs/kit';
import { ANTHROPIC_API_KEY, CLAUDE_MODEL } from '$app/env/private';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
export const MAX_IMAGE_CHARS = 1_500_000; // ~1.1 МБ после base64

/** Достаёт первый JSON-объект из текстового ответа модели. */
export function extractJson(text: string): unknown {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start < 0 || end < start) throw new Error('В ответе нет JSON');
	return JSON.parse(text.slice(start, end + 1));
}

export function checkImage(dataUrl: unknown): string {
	if (typeof dataUrl !== 'string' || dataUrl.length > MAX_IMAGE_CHARS || !IMAGE_RE.test(dataUrl)) {
		error(400, 'Нужна картинка jpeg/png/webp до ~1 МБ');
	}
	return dataUrl;
}

export async function askJson(opts: {
	system: string;
	text: string;
	imageDataUrl?: string;
	maxTokens?: number;
}): Promise<unknown> {
	const key = ANTHROPIC_API_KEY;
	if (!key) error(500, 'ANTHROPIC_API_KEY не задан');

	const content: unknown[] = [];
	if (opts.imageDataUrl) {
		const m = IMAGE_RE.exec(opts.imageDataUrl)!;
		content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
	}
	content.push({ type: 'text', text: opts.text });

	let res: Response;
	try {
		res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': key,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: CLAUDE_MODEL || DEFAULT_MODEL,
				max_tokens: opts.maxTokens ?? 400,
				system: opts.system,
				messages: [{ role: 'user', content }]
			}),
			signal: AbortSignal.timeout(25_000)
		});
	} catch {
		error(504, 'Claude не ответил вовремя');
	}
	if (!res.ok) error(502, `Ошибка Claude API (${res.status})`);

	const data = (await res.json()) as { content?: { type: string; text?: string }[] };
	const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
	try {
		return extractJson(text);
	} catch {
		error(502, 'Claude вернул ответ в неожиданном формате');
	}
}
