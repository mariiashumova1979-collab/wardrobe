<script lang="ts">
	import { wardrobe } from '../store.svelte';
	import { ago, dateKey } from '../dates';
	import { wearStats, type Group, type Period } from '../stats';
	import { pluralRu } from '../taxonomy';

	const today = dateKey();
	const PERIODS: { id: Period; label: string }[] = [
		{ id: 30, label: '30 дней' },
		{ id: 90, label: '90 дней' },
		{ id: 'all', label: 'Всё время' }
	];
	const SHORT = 6;

	let period = $state<Period>(30);
	let open = $state<Group[]>([]);

	const stats = $derived(wearStats(wardrobe.items, wardrobe.log, period, today));
	function lastText(count: number, last: string | null) {
		if (!last) return 'ещё не надевала';
		return `${count ? 'последний раз' : 'за период не надевала, последний раз'}: ${ago(last, today)}`;
	}
	const span = $derived(period === 'all' ? 'за всё время' : `за ${period} дней`);
</script>

<div class="chips" role="group" aria-label="Период" style="margin-top:0">
	{#each PERIODS as p (p.id)}
		<button class="chip" type="button" aria-pressed={period === p.id} onclick={() => (period = p.id)}>{p.label}</button>
	{/each}
</div>

{#if !stats.length}
	<div class="empty"><p>Добавь вещи, и здесь появится статистика носки.</p></div>
{/if}

{#each stats as g (g.group)}
	{@const max = Math.max(1, ...g.rows.map((r) => r.count))}
	{@const rows = open.includes(g.group) ? g.rows : g.rows.slice(0, SHORT)}
	<section class="st" data-group={g.group}>
		<h3 class="sec" style="margin-top:20px">{g.label}</h3>
		<p class="hint" style="margin-top:0">Надето {g.worn} из {g.total} {span}</p>
		<div class="srows">
			{#each rows as r (r.item.id)}
				<div class="srow" data-zero={r.count === 0}>
					<img src={wardrobe.url(r.item)} alt="" />
					<div class="sm">
						<div class="sn">
							<b>{r.item.brand ? r.item.brand + ' ' : ''}{r.item.name}</b>
							<span class="cnt">{r.count ? pluralRu(r.count, ['раз', 'раза', 'раз']) : '—'}</span>
						</div>
						<div class="meter"><i style="width:{Math.round((r.count / max) * 100)}%"></i></div>
						<span class="hint" style="margin:0">{lastText(r.count, r.last)}</span>
					</div>
				</div>
			{/each}
		</div>
		{#if g.rows.length > SHORT}
			<button
				class="btn ghost"
				type="button"
				style="width:100%;margin-top:8px"
				onclick={() => (open = open.includes(g.group) ? open.filter((x) => x !== g.group) : [...open, g.group])}
			>
				{open.includes(g.group) ? 'Свернуть' : `Показать все (${g.rows.length})`}
			</button>
		{/if}
	</section>
{/each}
