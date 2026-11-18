import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** true для адресов, на которые серверу ходить нельзя (локальные, частные, служебные). */
export function isPrivateIp(ip: string): boolean {
	if (ip.includes(':')) {
		const v = ip.toLowerCase();
		if (v === '::1' || v === '::') return true;
		if (v.startsWith('::ffff:')) {
			const tail = v.slice(7);
			return tail.includes('.') ? isPrivateIp(tail) : true; // hex-форма — на всякий случай блокируем
		}
		return /^(fc|fd|fe[89ab])/.test(v);
	}
	const p = ip.split('.').map(Number);
	if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
	const [a, b] = p;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127) ||
		a >= 224
	);
}

/**
 * Разрешает только http(s) на стандартных портах и только публичные адреса.
 * Оговорка: между проверкой DNS и самим запросом адрес теоретически может смениться
 * (DNS rebinding). Для личного приложения с кодом доступа этого достаточно.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		throw new Error('Некорректный адрес');
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Только http(s)');
	if (u.port && u.port !== '80' && u.port !== '443') throw new Error('Нестандартный порт');
	if (u.username || u.password) throw new Error('Адрес с логином не разрешён');
	const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
		throw new Error('Локальный адрес');
	}
	if (isIP(host)) {
		if (isPrivateIp(host)) throw new Error('Локальный адрес');
		return u;
	}
	const addrs = await lookup(host, { all: true });
	if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Локальный адрес');
	return u;
}
