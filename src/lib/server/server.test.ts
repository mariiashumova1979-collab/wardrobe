import { describe, expect, it } from 'vitest';
import { isPrivateIp, assertPublicUrl } from './guard';
import { pickToolInput } from './claude';
import { buildSearchQuery, hasCyrillic } from '../query';
import { sanitizeAttrs, layerOf } from '../taxonomy';

describe('isPrivateIp', () => {
	it.each(['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.255', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '999.1.1.1'])(
		'блокирует %s',
		(ip) => expect(isPrivateIp(ip)).toBe(true)
	);
	it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('пропускает %s', (ip) =>
		expect(isPrivateIp(ip)).toBe(false)
	);
});

describe('assertPublicUrl', () => {
	it.each([
		'file:///etc/passwd',
		'ftp://example.com/a.jpg',
		'http://localhost/a.jpg',
		'http://127.0.0.1/a.jpg',
		'http://[::1]/a.jpg',
		'http://169.254.169.254/latest/meta-data',
		'https://example.com:8443/a.jpg',
		'https://user:pw@example.com/a.jpg',
		'http://printer.local/a.jpg',
		'не адрес'
	])('отклоняет %s', async (u) => {
		await expect(assertPublicUrl(u)).rejects.toThrow();
	});
	it('пропускает публичный IP', async () => {
		const u = await assertPublicUrl('https://1.1.1.1/a.jpg');
		expect(u.hostname).toBe('1.1.1.1');
	});
});

describe('pickToolInput', () => {
	it('достаёт аргументы нужного инструмента', () => {
		const data = { content: [{ type: 'text', text: 'Сейчас' }, { type: 'tool_use', name: 'save_item', input: { name: 'Рубашка' } }] };
		expect(pickToolInput(data, 'save_item')).toEqual({ name: 'Рубашка' });
	});
	it('не путает инструменты и не принимает текст вместо вызова', () => {
		expect(pickToolInput({ content: [{ type: 'tool_use', name: 'other', input: {} }] }, 'save_item')).toBeUndefined();
		expect(pickToolInput({ content: [{ type: 'text', text: '{"a":1}' }], stop_reason: 'max_tokens' }, 'save_item')).toBeUndefined();
		expect(pickToolInput({}, 'save_item')).toBeUndefined();
	});
	it('отбрасывает input не-объект', () => {
		expect(pickToolInput({ content: [{ type: 'tool_use', name: 'x', input: [1] }] }, 'x')).toBeUndefined();
		expect(pickToolInput({ content: [{ type: 'tool_use', name: 'x', input: null }] }, 'x')).toBeUndefined();
	});
});

describe('buildSearchQuery', () => {
	it('добавляет «product photo» к обычному описанию', () => {
		expect(buildSearchQuery('  white   oversized shirt Zara ')).toBe('white oversized shirt Zara product photo');
	});
	it('не трогает запрос с артикулом', () => {
		expect(buildSearchQuery('Zara 2753/401')).toBe('Zara 2753/401');
		expect(buildSearchQuery('Nike DH2987-100')).toBe('Nike DH2987-100');
	});
});

describe('hasCyrillic', () => {
	it('отличает русский текст от латиницы и артикулов', () => {
		expect(hasCyrillic('белая рубашка')).toBe(true);
		expect(hasCyrillic('Zara 2753/401')).toBe(false);
		expect(hasCyrillic('Zara белая')).toBe(true);
	});
});

describe('sanitizeAttrs', () => {
	it('оставляет только допустимое', () => {
		const r = sanitizeAttrs({
			name: '  Белая рубашка ',
			category: 'shirt',
			colors: ['white', 'bogus', 'white', 'black', 'red', 'blue'],
			material: 'Хлопок',
			seasons: ['spring', 'nope'],
			formality: 'weird'
		});
		expect(r).toEqual({ name: 'Белая рубашка', category: 'shirt', colors: ['white', 'black', 'red'], material: 'Хлопок', seasons: ['spring'] });
	});
	it('не падает на мусоре', () => {
		expect(sanitizeAttrs(null)).toEqual({});
		expect(sanitizeAttrs('x')).toEqual({});
	});
});

describe('layerOf', () => {
	it('второй слой — только разрешённые категории', () => {
		for (const c of ['turtleneck', 'sweater', 'cardigan', 'hoodie', 'blazer']) expect(layerOf(c)).toBe('second');
		expect(layerOf('outer')).toBe('outer');
		expect(layerOf('shirt')).toBe('base');
	});
});

import { mapSerperImages, parseRatings, rankCandidates, sanitizeBox, type Candidate } from './images';

const cand = (n: number): Candidate[] =>
	Array.from({ length: n }, (_, i) => ({ id: String(i), title: '', source: '', thumb: `https://t/${i}`, full: `https://f/${i}`, width: null, height: null }));

describe('mapSerperImages', () => {
	it('берёт поля Serper и пропускает записи без адреса картинки', () => {
		const r = mapSerperImages({
			images: [
				{ title: 'Levi 501', imageUrl: 'https://a.com/1.jpg', thumbnailUrl: 'https://g.com/t1', domain: 'a.com', imageWidth: 800, imageHeight: 1000 },
				{ title: 'нет адреса' },
				{ imageUrl: 'javascript:alert(1)' },
				{ imageUrl: 'https://b.com/2.jpg', source: 'B' }
			]
		});
		expect(r).toHaveLength(2);
		expect(r[0]).toMatchObject({ full: 'https://a.com/1.jpg', thumb: 'https://g.com/t1', source: 'a.com', width: 800, height: 1000 });
		expect(r[1]).toMatchObject({ thumb: 'https://b.com/2.jpg', source: 'B', width: null });
	});
	it('переживает пустой и кривой ответ', () => {
		expect(mapSerperImages(null)).toEqual([]);
		expect(mapSerperImages({})).toEqual([]);
	});
});

describe('parseRatings', () => {
	it('отбрасывает мусор, дубликаты и выход за диапазон; fit ограничивает 0–10', () => {
		const r = parseRatings(
			{ ratings: [{ index: 0, fit: 12, person: true }, { index: 0, fit: 1, person: false }, { index: 5, fit: 5, person: false }, { index: -1 }, { index: 1, fit: 'x' }, null] },
			3
		);
		expect(r).toEqual([
			{ index: 0, fit: 10, person: true },
			{ index: 1, fit: 5, person: false }
		]);
	});
	it('не падает без ratings', () => {
		expect(parseRatings({}, 3)).toEqual([]);
		expect(parseRatings(null, 3)).toEqual([]);
	});
});

describe('rankCandidates', () => {
	it('прячет неподходящие цвет и модель и ставит вещь без человека выше', () => {
		const items = cand(5);
		const ratings = [
			{ index: 0, fit: 2, person: false }, // не тот цвет
			{ index: 1, fit: 9, person: true }, // подходит, но на модели: 6
			{ index: 2, fit: 8, person: false }, // 8
			{ index: 3, fit: 7, person: false }, // 7
			{ index: 4, fit: 3, person: false } // мимо
		];
		expect(rankCandidates(items, ratings).map((c) => c.id)).toEqual(['2', '3', '1']);
	});
	it('если почти всё мимо, показывает как есть, а не пустой экран', () => {
		const items = cand(4);
		const ratings = items.map((_, i) => ({ index: i, fit: 1, person: false }));
		expect(rankCandidates(items, ratings)).toHaveLength(4);
	});
	it('кадры без оценки остаются в выдаче', () => {
		expect(rankCandidates(cand(3), [])).toHaveLength(3);
	});
	it('ограничивает количество', () => {
		expect(rankCandidates(cand(30), [], 12)).toHaveLength(12);
	});
});

describe('sanitizeBox', () => {
	it('переводит 0–1000 в доли', () => {
		expect(sanitizeBox({ found: true, x1: 100, y1: 200, x2: 600, y2: 900 })).toEqual({ x1: 0.1, y1: 0.2, x2: 0.6, y2: 0.9 });
	});
	it('ограничивает выход за края', () => {
		expect(sanitizeBox({ found: true, x1: -50, y1: 0, x2: 2000, y2: 1000 })).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
	});
	it.each([
		[{ found: false, x1: 0, y1: 0, x2: 900, y2: 900 }],
		[{ found: true, x1: 500, y1: 0, x2: 400, y2: 900 }],
		[{ found: true, x1: 0, y1: 0, x2: 30, y2: 900 }],
		[{ found: true }],
		[null]
	])('возвращает null для %j', (raw) => {
		expect(sanitizeBox(raw)).toBeNull();
	});
});

import { seenVars } from './diagnostics';

describe('seenVars', () => {
	it('показывает только имена наших переменных и только непустые', () => {
		const out = seenVars({ ANTHROPIC_API_KEY: 'sk-secret', SERPER_KEY: 'x', ACCESS_CODE: '', PATH: '/bin', HOME: '/root' });
		expect(out).toContain('ANTHROPIC_API_KEY');
		expect(out).toContain('SERPER_KEY'); // опечатка в имени сразу видна
		expect(out).not.toContain('sk-secret');
		expect(out).not.toContain('ACCESS_CODE');
		expect(out).not.toContain('PATH');
	});
	it('подсказывает, если не видно ничего', () => {
		expect(seenVars({ PATH: '/bin' })).toContain('не видит ни одной');
	});
});
