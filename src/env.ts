import { defineEnvVars } from '@sveltejs/kit/env';

// Все переменные необязательны на уровне запуска: если ключ не задан,
// конкретный эндпоинт отвечает понятной ошибкой, а не роняет всё приложение.
const optional = (value: string | undefined) => value?.trim() || undefined;

export const variables = defineEnvVars({
	/** Код доступа к /api/*: без него приложение закрыто. */
	ACCESS_CODE: { schema: optional },
	/** Ключ Brave Search API (поиск картинок). */
	BRAVE_API_KEY: { schema: optional },
	/** Ключ Anthropic API (определение вещи и разметка). */
	ANTHROPIC_API_KEY: { schema: optional },
	/** Необязательно: другая модель Claude вместо модели по умолчанию. */
	CLAUDE_MODEL: { schema: optional }
});
