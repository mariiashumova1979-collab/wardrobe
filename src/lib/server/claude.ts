import { error } from '@sveltejs/kit';
import { ANTHROPIC_API_KEY, CLAUDE_MODEL } from '$app/env/private';
import { seenVars } from './diagnostics';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
export const MAX_IMAGE_CHARS = 1_500_000; // ~1.1 МБ после base64

export type Tool = {
	name: string;
	description: string;
	/** JSON Schema аргументов: модель обязана вернуть данные именно в этой форме. */
	schema: Record<string, unknown>;
};

type Block = { type: string; name?: string; input?: unknown; text?: string };
type ApiMessage = { content?: Block[]; stop_reason?: string };

/** Достаёт аргументы вызванного инструмента из ответа API. */
export function pickToolInput(data: ApiMessage, name: string): Record<string, unknown> | undefined {
	const block = data.content?.find((c) => c.type === 'tool_use' && c.name === name);
	const input = block?.input;
	return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
}

export function checkImage(dataUrl: unknown): string {
	if (typeof dataUrl !== 'string' || dataUrl.length > MAX_IMAGE_CHARS || !IMAGE_RE.test(dataUrl)) {
		error(400, 'Нужна картинка jpeg/png/webp до ~1 МБ');
	}
	return dataUrl;
}

/**
 * Спрашивает Claude и принуждает ответить вызовом инструмента.
 * Так ответ всегда приходит структурой по схеме, а не текстом, из которого надо выковыривать JSON.
 */
export async function askTool(opts: {
	system: string;
	text: string;
	tool: Tool;
	/** Картинки data-URL. Если их несколько, перед каждой идёт подпись «Изображение N». */
	images?: string[];
	maxTokens?: number;
	timeoutMs?: number;
}): Promise<Record<string, unknown>> {
	const key = ANTHROPIC_API_KEY;
	if (!key) error(500, `ANTHROPIC_API_KEY не найден на сервере. ${seenVars()}`);

	const content: unknown[] = [];
	const images = opts.images ?? [];
	images.forEach((url, i) => {
		const m = IMAGE_RE.exec(url);
		if (!m) return;
		if (images.length > 1) content.push({ type: 'text', text: `Изображение ${i}:` });
		content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
	});
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
				max_tokens: opts.maxTokens ?? 600,
				system: opts.system,
				tools: [{ name: opts.tool.name, description: opts.tool.description, input_schema: opts.tool.schema }],
				tool_choice: { type: 'tool', name: opts.tool.name },
				messages: [{ role: 'user', content }]
			}),
			signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000)
		});
	} catch {
		error(504, 'Claude не ответил вовремя');
	}

	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
		const reason = body?.error?.message?.slice(0, 160);
		console.error('Claude API error', res.status, reason);
		error(502, `Ошибка Claude API (${res.status})${reason ? ': ' + reason : ''}`);
	}

	const data = (await res.json()) as ApiMessage;
	const input = pickToolInput(data, opts.tool.name);
	if (!input) {
		// Видно в логах хостинга: почему ответ оказался не по схеме.
		console.error('Claude: ответ без вызова инструмента', {
			stop_reason: data.stop_reason,
			blocks: data.content?.map((c) => c.type),
			text: data.content?.find((c) => c.type === 'text')?.text?.slice(0, 300)
		});
		error(502, `Claude не вернул результат (${data.stop_reason ?? 'причина неизвестна'}). Попробуй ещё раз.`);
	}
	return input;
}
