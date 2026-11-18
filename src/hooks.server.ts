import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { ACCESS_CODE } from '$app/env/private';
import { timingSafeEqual } from 'node:crypto';

function same(a: string, b: string) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

// Все /api/* тратят платные ключи, поэтому закрыты кодом доступа.
export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/api/')) {
		const code = ACCESS_CODE;
		if (!code) {
			if (!dev) return json({ message: 'ACCESS_CODE не задан на сервере' }, { status: 503 });
		} else if (!same(event.request.headers.get('x-access-code') ?? '', code)) {
			return json({ message: 'Нужен код доступа' }, { status: 401 });
		}
	}
	return resolve(event);
};
