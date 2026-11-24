// Журнал носки: какие вещи надеты в какой день. Чистые функции, чтобы проверять их тестами.
import { parseKey } from './dates';
import { markKey, type Mark } from './syncstate';

export type WearLog = Record<string, string[]>;
type Worn = { id: string; wearCount: number; lastWorn: number | null; baseLast?: number | null; wearBase?: number };

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
export function applyDay<T extends Worn>(
	items: T[],
	log: WearLog,
	date: string,
	ids: string[],
	now = Date.now()
): { items: T[]; log: WearLog; marks: Record<string, Mark> } {
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
			lastWorn: last ? parseKey(last).getTime() : (it.baseLast ?? null)
		};
	});
	// что именно изменилось в этот день: по этому слияние понимает, кто прав при правке с двух устройств
	const marks: Record<string, Mark> = {};
	for (const id of added) marks[markKey(date, id)] = { on: true, at: now };
	for (const id of removed) marks[markKey(date, id)] = { on: false, at: now };
	return { items: out, log: nextLog, marks };
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

/** Журнал из отметок: только включённые и только для вещей, которые есть. */
export function marksToLog(marks: Record<string, Mark>, known: Set<string>): WearLog {
	const rows: { date: string; id: string; at: number }[] = [];
	for (const [k, m] of Object.entries(marks)) {
		const date = k.slice(0, 10);
		const id = k.slice(11);
		if (m.on && known.has(id)) rows.push({ date, id, at: m.at });
	}
	rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
	const log: WearLog = {};
	for (const r of rows) (log[r.date] ??= []).push(r.id);
	return log;
}

/** Журнал, который велся до синхронизации, превращается в отметки. Время ставится по дню, чтобы любая новая правка была позже. */
export function logToMarks(log: WearLog, have: Record<string, Mark>): Record<string, Mark> {
	const out = { ...have };
	for (const [date, ids] of Object.entries(log)) {
		for (const id of ids) {
			const k = markKey(date, id);
			if (!out[k]) out[k] = { on: true, at: parseKey(date).getTime() };
		}
	}
	return out;
}

/** После слияния счётчики вещей заново считаются из журнала. */
export function reconcileWear<T extends Worn>(items: T[], log: WearLog): T[] {
	const count = new Map<string, number>();
	const last = new Map<string, string>();
	for (const [d, ids] of Object.entries(log)) {
		for (const id of ids) {
			count.set(id, (count.get(id) ?? 0) + 1);
			if (d > (last.get(id) ?? '')) last.set(id, d);
		}
	}
	return items.map((it) => {
		const l = last.get(it.id);
		const wearCount = (it.wearBase ?? 0) + (count.get(it.id) ?? 0);
		const lastWorn = l ? Math.max(parseKey(l).getTime(), it.baseLast ?? 0) : (it.baseLast ?? null);
		return it.wearCount === wearCount && it.lastWorn === lastWorn ? it : { ...it, wearCount, lastWorn };
	});
}
