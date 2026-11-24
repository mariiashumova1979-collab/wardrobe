<script lang="ts">
	import { onMount } from 'svelte';
	import { wardrobe } from '../lib/store.svelte';
	import Closet from '../lib/components/Closet.svelte';
	import Today from '../lib/components/Today.svelte';
	import Gaps from '../lib/components/Gaps.svelte';

	const TABS = [
		{ id: 'closet', label: 'Гардероб' },
		{ id: 'today', label: 'Что надеть' },
		{ id: 'gaps', label: 'Дыры' }
	] as const;
	type Tab = (typeof TABS)[number]['id'];
	const KEY = 'wardrobe-tab';

	const saved = sessionStorage.getItem(KEY);
	let tab = $state<Tab>(TABS.some((t) => t.id === saved) ? (saved as Tab) : 'closet');
	const go = (t: Tab) => {
		tab = t;
		sessionStorage.setItem(KEY, t);
		window.scrollTo({ top: 0 });
	};

	onMount(() => wardrobe.load());
</script>

{#if tab === 'closet'}
	<Closet />
{:else if tab === 'today'}
	<Today ongaps={() => go('gaps')} />
{:else}
	<Gaps />
{/if}

<nav class="tabs" aria-label="Разделы">
	{#each TABS as t (t.id)}
		<button type="button" class="tab" aria-current={tab === t.id ? 'page' : undefined} onclick={() => go(t.id)}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if t.id === 'closet'}
					<rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
					<rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
				{:else if t.id === 'today'}
					<circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
				{:else}
					<circle cx="12" cy="12" r="8" stroke-dasharray="3.2 3.2" /><circle cx="12" cy="12" r="1.2" />
				{/if}
			</svg>
			{t.label}
		</button>
	{/each}
</nav>
