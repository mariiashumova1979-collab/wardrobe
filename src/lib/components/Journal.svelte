<script lang="ts">
	import WearCalendar from './WearCalendar.svelte';
	import WearStats from './WearStats.svelte';

	let view = $state<'cal' | 'stats'>('cal');
</script>

<header>
	<h1>Журнал</h1>
	<p class="sub-head">Что и когда надето, и как часто</p>
</header>

<div class="seg" role="tablist" aria-label="Раздел журнала">
	<button type="button" role="tab" aria-selected={view === 'cal'} onclick={() => (view = 'cal')}>Календарь</button>
	<button type="button" role="tab" aria-selected={view === 'stats'} onclick={() => (view = 'stats')}>Статистика</button>
</div>

<main>
	{#if view === 'cal'}<WearCalendar />{:else}<WearStats />{/if}
</main>
