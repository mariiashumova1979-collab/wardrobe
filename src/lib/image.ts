type ShrinkOptions = {
	/** Залить прозрачность белым (нужно для JPEG и для отправки в Claude). */
	flatten?: boolean;
	type?: 'image/jpeg' | 'image/webp' | 'image/png';
	quality?: number;
};

/** Уменьшает картинку так, чтобы большая сторона была не больше max. */
export async function shrink(blob: Blob, max: number, opts: ShrinkOptions = {}): Promise<Blob> {
	const bmp = await createImageBitmap(blob);
	const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
	const w = Math.max(1, Math.round(bmp.width * k));
	const h = Math.max(1, Math.round(bmp.height * k));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	if (opts.flatten) {
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, w, h);
	}
	ctx.drawImage(bmp, 0, 0, w, h);
	bmp.close();
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Не удалось сжать картинку'))),
			opts.type ?? 'image/jpeg',
			opts.quality ?? 0.85
		)
	);
}

/** Обрезает картинку по рамке (доли 0–1) с небольшим запасом по краям. */
export async function crop(
	blob: Blob,
	box: { x1: number; y1: number; x2: number; y2: number },
	pad = 0.05
): Promise<Blob> {
	const bmp = await createImageBitmap(blob);
	const x1 = Math.max(0, box.x1 - pad) * bmp.width;
	const y1 = Math.max(0, box.y1 - pad) * bmp.height;
	const x2 = Math.min(1, box.x2 + pad) * bmp.width;
	const y2 = Math.min(1, box.y2 + pad) * bmp.height;
	const w = Math.max(1, Math.round(x2 - x1));
	const h = Math.max(1, Math.round(y2 - y1));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	canvas.getContext('2d')!.drawImage(bmp, x1, y1, w, h, 0, 0, w, h);
	bmp.close();
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось обрезать'))), 'image/jpeg', 0.9)
	);
}

export function blobToDataURL(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = () => reject(r.error);
		r.readAsDataURL(blob);
	});
}

/** Вырезает фон прямо в браузере. Модель (~40 МБ) скачивается один раз и кэшируется. */
export async function cutout(blob: Blob, onProgress?: (fraction: number) => void): Promise<Blob> {
	const { removeBackground } = await import('@imgly/background-removal');
	return removeBackground(blob, {
		model: 'isnet_quint8',
		output: { format: 'image/png' },
		progress: (_key, current, total) => {
			if (total > 0) onProgress?.(current / total);
		}
	});
}
