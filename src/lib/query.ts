export const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s);

/**
 * Что отправить в поиск картинок. Для обычного описания добавляем «product photo» — так выдача
 * состоит в основном из магазинных фото. Если в запросе есть артикул (4+ цифры подряд),
 * ничего не добавляем: лишние слова только размывают точный код.
 */
export function buildSearchQuery(q: string): string {
	const t = q.trim().replace(/\s+/g, ' ');
	return /\d{4,}/.test(t) ? t : `${t} product photo`;
}
