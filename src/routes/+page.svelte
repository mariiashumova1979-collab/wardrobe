<script lang="ts">
	import { onMount } from 'svelte';
	import { wardrobe } from '../lib/store.svelte';
	import { wishlist } from '../lib/wishlist.svelte';
	import Closet from '../lib/components/Closet.svelte';
	import Today from '../lib/components/Today.svelte';
	import Journal from '../lib/components/Journal.svelte';
	import Gaps from '../lib/components/Gaps.svelte';
	import SyncSheet from '../lib/components/SyncSheet.svelte';
	import { sync } from '../lib/sync.svelte';

	const TABS = [
		{ id: 'closet', label: 'Гардероб' },
		{ id: 'today', label: 'Что надеть' },
		{ id: 'journal', label: 'Журнал' },
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

	let syncOpen = $state(false);

	onMount(() => {
		Promise.all([wardrobe.load(), wishlist.load()]).then(() => sync.run());
		// вернулась в приложение или появилась сеть: подтягиваем то, что поменялось на другом устройстве
		const wake = () => document.visibilityState === 'visible' && sync.run();
		document.addEventListener('visibilitychange', wake);
		window.addEventListener('online', wake);
		return () => {
			document.removeEventListener('visibilitychange', wake);
			window.removeEventListener('online', wake);
		};
	});

	// любая правка вещей, журнала или списка желаемого запускает отправку
	$effect(() => {
		wardrobe.rev;
		wishlist.rev;
		sync.touch();
	});
</script>

{#if tab === 'closet'}
	<Closet />
{:else if tab === 'today'}
	<Today ongaps={() => go('gaps')} />
{:else if tab === 'journal'}
	<Journal />
{:else}
	<Gaps />
{/if}

<button
	type="button"
	class="sync-btn"
	data-status={sync.status}
	aria-label={sync.enabled ? 'Синхронизация: ' + ({ syncing: 'идёт', ok: 'готово', error: 'ошибка', unconfigured: 'не настроена', idle: 'включена', off: 'выключена' }[sync.status]) : 'Синхронизация выключена'}
	onclick={() => (syncOpen = true)}
>
	<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-4M4 5v4h4M4 13a8 8 0 0 0 14 4M20 19v-4h-4" /></svg>
</button>

{#if syncOpen}<SyncSheet onclose={() => (syncOpen = false)} />{/if}

<nav class="tabs" aria-label="Разделы">
	{#each TABS as t (t.id)}
		<button type="button" class="tab" aria-current={tab === t.id ? 'page' : undefined} onclick={() => go(t.id)}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if t.id === 'closet'}
					<rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
					<rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
				{:else if t.id === 'today'}
					<circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
				{:else if t.id === 'journal'}
					<rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" />
				{:else}
					<circle cx="12" cy="12" r="8" stroke-dasharray="3.2 3.2" /><circle cx="12" cy="12" r="1.2" />
				{/if}
			</svg>
			{t.label}
		</button>
	{/each}
</nav>
