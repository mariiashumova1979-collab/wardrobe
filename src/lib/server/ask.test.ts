import { afterEach, describe, expect, it, vi } from 'vitest';

// Подменяем сеть и ключ: проверяем, что мы шлём Claude и как реагируем на ответы.
vi.mock('$app/env/private', () => ({ ANTHROPIC_API_KEY: 'test-key', CLAUDE_MODEL: undefined }));
import { askTool } from './claude';

const tool = { name: 'save_item', description: 'd', schema: { type: 'object', properties: {} } };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.restoreAllMocks());

describe('askTool', () => {
	it('требует вызов инструмента и возвращает его аргументы', async () => {
		const spy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(reply({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'save_item', input: { name: 'Рубашка' } }] }));
		const out = await askTool({ system: 's', text: 't', tool, imageDataUrl: 'data:image/png;base64,AAAA' });
		expect(out).toEqual({ name: 'Рубашка' });

		const [url, init] = spy.mock.calls[0] as [string, RequestInit];
		const sent = JSON.parse(init.body as string);
		expect(url).toBe('https://api.anthropic.com/v1/messages');
		expect(sent.tool_choice).toEqual({ type: 'tool', name: 'save_item' });
		expect(sent.tools[0].name).toBe('save_item');
		expect(sent.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
		expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
	});

	it('при ответе без инструмента даёт понятную причину', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"query":"bla' }] }));
		await expect(askTool({ system: 's', text: 't', tool })).rejects.toMatchObject({ status: 502, body: { message: expect.stringContaining('max_tokens') } });
	});

	it('показывает причину ошибки API', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ error: { message: 'model: not found' } }, 404));
		await expect(askTool({ system: 's', text: 't', tool })).rejects.toMatchObject({ status: 502, body: { message: expect.stringContaining('model: not found') } });
	});
});
