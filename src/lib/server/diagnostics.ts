// Помогает понять, почему сервер «не видит» ключ: показывает ИМЕНА переменных (не значения),
// которые относятся к приложению. Опечатка в имени или не та среда сразу видны.
const OURS = /^(ACCESS_CODE|ANTHROPIC|CLAUDE|SERP|BRAVE|BLOB|SYNC)/i;

export function seenVars(env: Record<string, string | undefined> = process.env): string {
	const names = Object.entries(env)
		.filter(([name, value]) => OURS.test(name) && value !== undefined && value.trim() !== '')
		.map(([name]) => name)
		.sort();
	return names.length
		? `Сервер видит: ${names.join(', ')}.`
		: 'Сервер не видит ни одной переменной приложения: вероятно, они не добавлены для этого окружения или деплой собран до их добавления.';
}
