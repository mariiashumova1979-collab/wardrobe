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
