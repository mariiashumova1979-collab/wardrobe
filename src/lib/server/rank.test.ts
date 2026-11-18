import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./claude', () => ({ askTool: vi.fn() }));
vi.mock('./guard', () => ({ assertPublicUrl: vi.fn(async (u: string) => new URL(u)) }));
import { askTool } from './claude';
import { rankByVision } from './rank';
import type { Candidate } from './images';

const items: Candidate[] = Array.from({ length: 4 }, (_, i) => ({
	id: String(i), title: '', source: '', thumb: `https://t.example/${i}.jpg`, full: `https://f.example/${i}.jpg`, width: null, height: null
}));
const jpeg = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });

afterEach(() => vi.restoreAllMocks());

describe('rankByVision', () => {
	it('возвращает оценки на места исходных кадров, даже если часть миниатюр не скачалась', async () => {
		// миниатюра №1 недоступна: Claude увидит 3 картинки (исходные 0, 2, 3)
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => (String(u).endsWith('/1.jpg') ? new Response('', { status: 404 }) : jpeg()));
		vi.mocked(askTool).mockResolvedValue({
			ratings: [
				{ index: 0, fit: 2, person: false }, // исходный 0: не тот цвет
				{ index: 1, fit: 9, person: false }, // исходный 2: лучший
				{ index: 2, fit: 8, person: false } // исходный 3
			]
		});
		const out = await rankByVision(items, 'бежевые джинсы Levi\'s 501');
		const call = vi.mocked(askTool).mock.calls[0][0];
		expect(call.images).toHaveLength(3);
		expect(call.text).toContain('бежевые джинсы');
		// хороших меньше трёх, поэтому показываем всё, но лучшие первыми; неоценённый №1 идёт со средним баллом
		expect(out.map((c) => c.id)).toEqual(['2', '3', '1', '0']);
		expect(out.find((c) => c.id === '2')?.fit).toBe(9);
	});

	it('если скачать почти ничего не удалось, не тратит запрос и отдаёт как есть', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
		vi.mocked(askTool).mockClear();
		const out = await rankByVision(items, 'x');
		expect(askTool).not.toHaveBeenCalled();
		expect(out).toHaveLength(4);
	});
});
