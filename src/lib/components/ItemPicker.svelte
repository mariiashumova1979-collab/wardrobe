<script lang="ts">
	import { wardrobe } from '../store.svelte';
	import { GROUPS, groupOf, type Group } from '../stats';
	import Sheet from './Sheet.svelte';

	let { selected, title, onclose, ondone }: { selected: string[]; title: string; onclose: () => void; ondone: (ids: string[]) => void } = $props();

	// svelte-ignore state_referenced_locally
	let chosen = $state<string[]>([...selected]);
	let group = $state<Group | 'all'>('all');

	const shown = $derived(wardrobe.items.filter((i) => group === 'all' || groupOf(i.category) === group));
	const present = $derived(GROUPS.filter((g) => wardrobe.items.some((i) => groupOf(i.category) === g.id)));
	const toggle = (id: string) => (chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
</script>

<Sheet {onclose} label={title}>
	<h2>{title}</h2>
	<div class="chips" role="group" aria-label="Группа" style="margin-top:10px">
		<button class="chip" type="button" aria-pressed={group === 'all'} onclick={() => (group = 'all')}>Все</button>
		{#each present as g (g.id)}
			<button class="chip" type="button" aria-pressed={group === g.id} onclick={() => (group = g.id)}>{g.label}</button>
		{/each}
	</div>
	{#if wardrobe.items.length}
		<div class="grid three">
			{#each shown as it (it.id)}
				<button class="tile pick-tile" type="button" aria-pressed={chosen.includes(it.id)} onclick={() => toggle(it.id)}>
					<img src={wardrobe.url(it)} alt={it.name} />
					<span class="cap">{it.name}</span>
					{#if chosen.includes(it.id)}<span class="ck" aria-hidden="true">✓</span>{/if}
				</button>
			{/each}
		</div>
	{:else}
		<p class="hint">В гардеробе пока нет вещей.</p>
	{/if}
	<div class="actions">
		<button class="btn primary" type="button" onclick={() => ondone(chosen)}>
			Готово{chosen.length ? ` · ${chosen.length}` : ''}
		</button>
		<button class="btn ghost" type="button" onclick={onclose}>Закрыть</button>
	</div>
</Sheet>
