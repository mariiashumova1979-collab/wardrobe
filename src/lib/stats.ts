// Статистика носки по журналу: отдельно одежда, обувь, сумки и рюкзаки.
import { addDays, dateKey } from './dates';
import type { WearLog } from './wearlog';

export type Group = 'clothes' | 'shoes' | 'bags';
export const GROUPS: { id: Group; label: string }[] = [
	{ id: 'clothes', label: 'Одежда' },
	{ id: 'shoes', label: 'Обувь' },
	{ id: 'bags', label: 'Сумки и рюкзаки' }
];
export const groupOf = (category: string): Group =>
	category === 'shoes' ? 'shoes' : category === 'bag' || category === 'backpack' ? 'bags' : 'clothes';

export type Period = 30 | 90 | 'all';
type Counted = { id: string; category: string; name: string; wearCount: number; lastWorn: number | null };
export type StatRow<T> = { item: T; count: number; last: string | null };
export type GroupStat<T> = {
	group: Group;
	label: string;
	rows: StatRow<T>[];
	/** Сколько вещей группы надето хотя бы раз за период. */
	worn: number;
	total: number;
};

/**
 * За 30 и 90 дней считаем по датам из журнала. «За всё время» берёт счётчик вещи:
 * в нём есть и отметки, сделанные до появления журнала.
 */
export function wearStats<T extends Counted>(items: T[], log: WearLog, period: Period, today: string): GroupStat<T>[] {
	const from = period === 'all' ? '0000-00-00' : addDays(today, -(period - 1));
	const counts = new Map<string, number>();
	const last = new Map<string, string>();
	for (const [d, ids] of Object.entries(log)) {
		if (d > today) continue;
		for (const id of ids) {
			if (d >= from) counts.set(id, (counts.get(id) ?? 0) + 1);
			if (d > (last.get(id) ?? '')) last.set(id, d);
		}
	}
	return GROUPS.flatMap(({ id, label }) => {
		const mine = items.filter((i) => groupOf(i.category) === id);
		if (!mine.length) return [];
		const rows: StatRow<T>[] = mine
			.map((item) => ({
				item,
				count: period === 'all' ? Math.max(item.wearCount, counts.get(item.id) ?? 0) : (counts.get(item.id) ?? 0),
				last: last.get(item.id) ?? (item.lastWorn ? dateKey(new Date(item.lastWorn)) : null)
			}))
			.sort((a, b) => b.count - a.count || (b.last ?? '').localeCompare(a.last ?? '') || a.item.name.localeCompare(b.item.name, 'ru'));
		return [{ group: id, label, rows, worn: rows.filter((r) => r.count > 0).length, total: rows.length }];
	});
}
