// Хранилище для синхронизации. В продакшене это Vercel Blob (закрытое хранилище),
// при разработке — обычная папка. Всё остальное работает через этот интерфейс и проверяется тестами с памятью вместо диска.
import { BlobPreconditionFailedError, get, list, put } from '@vercel/blob';
import { dev } from '$app/env';
import { BLOB_READ_WRITE_TOKEN, SYNC_DIR } from '$app/env/private';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SyncStore {
	readState(): Promise<{ text: string; etag: string } | null>;
	/** false — состояние успели изменить с другого устройства (etag устарел). */
	writeState(text: string, etag: string | null): Promise<boolean>;
	listPhotos(): Promise<string[]>;
	writePhoto(key: string, bytes: Uint8Array, type: string): Promise<void>;
	readPhoto(key: string): Promise<{ bytes: Uint8Array; type: string } | null>;
}

const STATE = 'state/wardrobe.json';
const PHOTOS = 'photos/';

export function blobStore(token: string): SyncStore {
	return {
		async readState() {
			// useCache: false — иначе можно прочитать версию минутной давности и затереть чужие правки
			const r = await get(STATE, { access: 'private', useCache: false, token });
			if (!r || r.statusCode !== 200 || !r.stream) return null;
			return { text: await new Response(r.stream).text(), etag: r.blob.etag };
		},
		async writeState(text, etag) {
			try {
				await put(STATE, text, {
					access: 'private',
					contentType: 'application/json',
					allowOverwrite: etag !== null,
					...(etag !== null ? { ifMatch: etag } : {}),
					token
				});
				return true;
			} catch (e) {
				// первая запись: файл уже появился с другого устройства; дальше: etag не совпал
				if (e instanceof BlobPreconditionFailedError || (etag === null && /already exists/i.test(String((e as Error)?.message)))) return false;
				throw e;
			}
		},
		async listPhotos() {
			const keys: string[] = [];
			let cursor: string | undefined;
			do {
				const page = await list({ prefix: PHOTOS, limit: 1000, cursor, token });
				for (const b of page.blobs) keys.push(b.pathname.slice(PHOTOS.length));
				cursor = page.hasMore ? page.cursor : undefined;
			} while (cursor);
			return keys;
		},
		async writePhoto(key, bytes, type) {
			await put(PHOTOS + key, Buffer.from(bytes), { access: 'private', contentType: type, allowOverwrite: true, token });
		},
		async readPhoto(key) {
			const r = await get(PHOTOS + key, { access: 'private', token });
			if (!r || r.statusCode !== 200 || !r.stream) return null;
			return { bytes: new Uint8Array(await new Response(r.stream).arrayBuffer()), type: r.blob.contentType ?? 'application/octet-stream' };
		}
	};
}

/** Только для разработки и проверки без Vercel. */
export function dirStore(dir: string): SyncStore {
	const sha = (t: string) => createHash('sha1').update(t).digest('hex');
	const state = join(dir, 'state.json');
	const photos = join(dir, 'photos');
	return {
		async readState() {
			try {
				const text = await readFile(state, 'utf8');
				return { text, etag: sha(text) };
			} catch {
				return null;
			}
		},
		async writeState(text, etag) {
			await mkdir(dir, { recursive: true });
			let cur: string | null = null;
			try {
				cur = sha(await readFile(state, 'utf8'));
			} catch {
				/* файла ещё нет */
			}
			if (cur !== etag) return false;
			await writeFile(state, text);
			return true;
		},
		async listPhotos() {
			try {
				return (await readdir(photos)).filter((f) => !f.endsWith('.type'));
			} catch {
				return [];
			}
		},
		async writePhoto(key, bytes, type) {
			await mkdir(photos, { recursive: true });
			await writeFile(join(photos, key), bytes);
			await writeFile(join(photos, key + '.type'), type);
		},
		async readPhoto(key) {
			try {
				return { bytes: new Uint8Array(await readFile(join(photos, key))), type: await readFile(join(photos, key + '.type'), 'utf8') };
			} catch {
				return null;
			}
		}
	};
}

export function getStore(): SyncStore | null {
	if (BLOB_READ_WRITE_TOKEN) return blobStore(BLOB_READ_WRITE_TOKEN);
	if (dev && SYNC_DIR) return dirStore(SYNC_DIR);
	return null;
}
