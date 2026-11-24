// Журнал носки: какие вещи надеты в какой день. Чистые функции, чтобы проверять их тестами.
import { parseKey } from './dates';

export type WearLog = Record<string, string[]>;
type Worn = { id: string; wearCount: number; lastWorn: number | null };

/** Последний день, когда вещь надевали по журналу. */
export function lastDate(log: WearLog, id: string): string | null {
	let best: string | null = null;
	for (const [d, ids] of Object.entries(log)) if (ids.includes(id) && (!best || d > best)) best = d;
	return best;
}

/**
 * Записывает, что в этот день надето ровно `ids`. Счётчики вещей меняются на разницу с прежней записью,
 * дата последней носки пересчитывается по журналу.
 */
export function applyDay<T extends Worn>(items: T[], log: WearLog, date: string, ids: string[]): { items: T[]; log: WearLog } {
	const known = new Set(items.map((i) => i.id));
	const next = [...new Set(ids)].filter((id) => known.has(id));
	const prev = log[date] ?? [];
	const nextLog = { ...log };
	if (next.length) nextLog[date] = next;
	else delete nextLog[date];

	const added = new Set(next.filter((id) => !prev.includes(id)));
	const removed = new Set(prev.filter((id) => !next.includes(id)));
	const out = items.map((it) => {
		if (!added.has(it.id) && !removed.has(it.id)) return it;
		const last = lastDate(nextLog, it.id);
		return {
			...it,
			wearCount: Math.max(0, it.wearCount + (added.has(it.id) ? 1 : -1)),
			lastWorn: last ? parseKey(last).getTime() : null
		};
	});
	return { items: out, log: nextLog };
}

/** Убирает удалённую вещь из всех дней. */
export function dropFromLog(log: WearLog, id: string): WearLog {
	const out: WearLog = {};
	for (const [d, ids] of Object.entries(log)) {
		const rest = ids.filter((x) => x !== id);
		if (rest.length) out[d] = rest;
	}
	return out;
}
