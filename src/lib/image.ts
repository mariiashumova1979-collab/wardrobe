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
