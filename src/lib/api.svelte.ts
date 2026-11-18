import type { Attrs } from './taxonomy';

const KEY = 'wardrobe-access';

/** Когда сервер просит код доступа, layout показывает окно ввода. */
export const auth = $state({ needed: false });

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export function setAccessCode(code: string) {
	localStorage.setItem(KEY, code.trim());
	auth.needed = false;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set('x-access-code', localStorage.getItem(KEY) ?? '');
	let res: Response;
	try {
		res = await fetch(path, { ...init, headers });
	} catch {
		throw new ApiError(0, 'Нет соединения с сервером');
	}
	if (res.status === 401) {
		auth.needed = true;
		throw new ApiError(401, 'Нужен код доступа');
	}
	if (!res.ok) {
		let message = '';
		try {
			message = ((await res.json()) as { message?: string }).message ?? '';
		} catch {
			/* тело не JSON */
		}
		throw new ApiError(res.status, message || `Ошибка ${res.status}`);
	}
	return res;
}

const postJson = (path: string, body: unknown) =>
	call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export type SearchResult = {
	id: string;
	title: string;
	source: string;
	thumb: string;
	full: string;
	width: number | null;
	height: number | null;
};

export const searchImages = async (q: string) =>
	(await (await call('/api/search?q=' + encodeURIComponent(q))).json()) as { results: SearchResult[] };

export const fetchImage = async (url: string) =>
	(await call('/api/proxy?url=' + encodeURIComponent(url))).blob();

export const tagImage = async (image: string, hint: string) =>
	(await (await postJson('/api/tag', { image, hint })).json()) as Partial<Attrs>;

export const identify = async (image: string) =>
	(await (await postJson('/api/identify', { image })).json()) as { query: string; brand: string; sku: string };

/** Русское описание → хороший английский запрос для поиска картинок. */
export const rewriteQuery = async (text: string) =>
	(await (await postJson('/api/query', { text })).json()) as { query: string };
