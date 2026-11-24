<script lang="ts">
	import { wardrobe } from '../store.svelte';
	import { dateKey, dayTitle, monthTitle } from '../dates';
	import { showToast } from '../toast.svelte';
	import { pluralRu } from '../taxonomy';
	import ItemPicker from './ItemPicker.svelte';

	const today = dateKey();
	const t = new Date();

	let selected = $state(today);
	let month = $state(new Date(t.getFullYear(), t.getMonth(), 1));
	let picking = $state(false);

	const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
	const cells = $derived.by(() => {
		const y = month.getFullYear();
		const m = month.getMonth();
		const lead = (new Date(y, m, 1).getDay() + 6) % 7; // неделя с понедельника
		const n = new Date(y, m + 1, 0).getDate();
		return [...Array<null>(lead).fill(null), ...Array.from({ length: n }, (_, i) => dateKey(new Date(y, m, i + 1)))];
	});
	const atCurrent = $derived(month.getFullYear() === t.getFullYear() && month.getMonth() === t.getMonth());
	const prefix = $derived(dateKey(month).slice(0, 7));
	const daysWithWear = $derived(Object.keys(wardrobe.log).filter((d) => d.startsWith(prefix)).length);
	const ids = $derived(wardrobe.log[selected] ?? []);
	const dayItems = $derived(ids.flatMap((id) => wardrobe.items.find((i) => i.id === id) ?? []));

	const shift = (n: number) => (month = new Date(month.getFullYear(), month.getMonth() + n, 1));

	async function save(next: string[]) {
		try {
			await wardrobe.setDay(selected, next);
			picking = false;
		} catch {
			showToast('Не удалось сохранить');
		}
	}
</script>

<div class="cal">
	<div class="cal-head">
		<button class="ic" type="button" aria-label="Предыдущий месяц" onclick={() => shift(-1)}>‹</button>
		<b>{monthTitle(month)}</b>
		<button class="ic" type="button" aria-label="Следующий месяц" disabled={atCurrent} onclick={() => shift(1)}>›</button>
	</div>
	<div class="cal-grid" role="grid">
		{#each WEEK as w (w)}<span class="wk">{w}</span>{/each}
		{#each cells as k, i (k ?? 'b' + i)}
			{#if k}
				{@const n = wardrobe.log[k]?.length ?? 0}
				<button
					class="cd"
					type="button"
					aria-pressed={selected === k}
					aria-label={dayTitle(k) + (n ? `, надето: ${n}` : '')}
					data-today={k === today}
					data-has={n > 0}
					disabled={k > today}
					onclick={() => (selected = k)}
				>
					{Number(k.slice(8))}
					{#if n}<i>{n}</i>{/if}
				</button>
			{:else}
				<span></span>
			{/if}
		{/each}
	</div>
	<p class="hint" style="margin:8px 0 0">
		{daysWithWear ? `В этом месяце записано дней: ${daysWithWear}` : 'В этом месяце записей пока нет'}
	</p>
</div>

<h3 class="sec">{dayTitle(selected)}</h3>
{#if dayItems.length}
	<div class="grid three">
		{#each dayItems as it (it.id)}
			<div class="tile worn-tile">
				<img src={wardrobe.url(it)} alt={it.name} />
				<span class="cap">{it.name}</span>
				<button class="rm" type="button" aria-label="Убрать: {it.name}" onclick={() => save(ids.filter((x) => x !== it.id))}>×</button>
			</div>
		{/each}
	</div>
	<p class="hint">{pluralRu(dayItems.length, ['вещь', 'вещи', 'вещей'])} в этот день</p>
{:else}
	<p class="hint" style="margin-top:0">Ничего не отмечено. Выбери вещи, которые были на тебе.</p>
{/if}
<div class="actions" style="margin-top:12px">
	<button class="btn" type="button" disabled={!wardrobe.items.length} onclick={() => (picking = true)}>
		{dayItems.length ? 'Изменить' : 'Отметить, что надела'}
	</button>
</div>

{#if picking}
	<ItemPicker selected={ids} title={dayTitle(selected)} onclose={() => (picking = false)} ondone={save} />
{/if}
