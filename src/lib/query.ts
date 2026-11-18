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

/**
 * Магазины часто пишут артикул без служебного префикса: на бирке «PC9-36200-0287»,
 * а на сайте «36200-0287». Убираем короткий буквенный префикс перед дефисом, остальное не трогаем.
 */
export function skuCore(sku: string): string {
	const t = sku.trim();
	const m = /^(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,4}-(?=\d)(.+)$/i.exec(t);
	return m && m[1].length >= 6 ? m[1] : t;
}
