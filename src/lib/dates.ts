// Даты в журнале носки хранятся как «ГГГГ-ММ-ДД» по местному времени.
const p2 = (n: number) => String(n).padStart(2, '0');

export const dateKey = (d: Date = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const isKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Полдень выбранного дня: переход на летнее время не сдвигает дату. */
export function parseKey(k: string): Date {
	const [y, m, d] = k.split('-').map(Number);
	return new Date(y, m - 1, d, 12);
}
export function addDays(k: string, n: number): string {
	const d = parseKey(k);
	d.setDate(d.getDate() + n);
	return dateKey(d);
}
export const daysBetween = (a: string, b: string) => Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const monthTitle = (d: Date) => cap(d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }));
export const dayTitle = (k: string) => cap(parseKey(k).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));

/** «сегодня», «вчера», «5 дн. назад», «3 нед. назад». */
export function ago(last: string | null, today: string): string {
	if (!last) return 'ещё не надевала';
	const n = daysBetween(last, today);
	if (n <= 0) return 'сегодня';
	if (n === 1) return 'вчера';
	if (n < 14) return `${n} дн. назад`;
	if (n < 60) return `${Math.round(n / 7)} нед. назад`;
	return `${Math.round(n / 30)} мес. назад`;
}
