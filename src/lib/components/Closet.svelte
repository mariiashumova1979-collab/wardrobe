<script lang="ts">
	import { wardrobe, type Item } from '../store.svelte';
	import { showToast } from '../toast.svelte';
	import { CATS, COLORS, catLabel, layerOf, pluralRu } from '../taxonomy';
	import type { Draft } from '../types';
	import AddFlow from './AddFlow.svelte';
	import ItemForm from './ItemForm.svelte';
	import Sheet from './Sheet.svelte';

	let filter = $state('all');
	let adding = $state(false);
	let editing = $state<Item | null>(null);
	let draft = $state<Draft | null>(null);
	let saving = $state(false);

	const secondCount = $derived(wardrobe.items.filter((i) => layerOf(i.category) === 'second').length);
	const presentCats = $derived(CATS.filter(([k]) => wardrobe.items.some((i) => i.category === k)));
	const shown = $derived(
		wardrobe.items.filter(
			(i) => filter === 'all' || (filter === 'second' ? layerOf(i.category) === 'second' : i.category === filter)
		)
	);
	// если вещей выбранной категории не осталось — возвращаемся к «Все»
	$effect(() => {
		if (filter !== 'all' && filter !== 'second' && !presentCats.some(([k]) => k === filter)) filter = 'all';
	});

	const countText = $derived(
		!wardrobe.loaded
			? 'Загружаю…'
			: wardrobe.items.length
				? pluralRu(wardrobe.items.length, ['вещь', 'вещи', 'вещей']) + (secondCount ? ` · ${secondCount} для второго слоя` : '')
				: 'Пока пусто'
	);

	function open(item: Item) {
		editing = item;
		draft = {
			name: item.name,
			brand: item.brand,
			category: item.category,
			colors: [...item.colors],
			material: item.material,
			seasons: [...item.seasons],
			formality: item.formality,
			wearCount: item.wearCount
		};
	}
	function close() {
		editing = null;
		draft = null;
		saving = false;
	}
	function merged(item: Item, d: Draft): Item {
		return {
			...item,
			name: d.name.trim() || catLabel(d.category),
			brand: d.brand.trim(),
			category: d.category,
			colors: [...d.colors],
			material: d.material.trim(),
			seasons: [...d.seasons],
			formality: d.formality || 'casual'
		};
	}
	async function save() {
		if (!editing || !draft) return;
		saving = true;
		try {
			await wardrobe.update(merged(editing, draft));
			showToast('Сохранено');
			close();
		} catch {
			saving = false;
			showToast('Не удалось сохранить');
		}
	}
	async function wear() {
		if (!editing || !draft) return;
		try {
			const next = { ...merged(editing, draft), wearCount: editing.wearCount + 1, lastWorn: Date.now() };
			await wardrobe.update(next);
			editing = next;
			draft.wearCount = next.wearCount;
			showToast('Отмечено: надела сегодня');
		} catch {
			showToast('Не удалось сохранить');
		}
	}
	async function remove() {
		if (!editing) return;
		try {
			await wardrobe.remove(editing.id);
			showToast('Удалено');
			close();
		} catch {
			showToast('Не удалось удалить');
		}
	}
	const colorCss = (k: string) => COLORS.find((c) => c[0] === k)?.[2] ?? '#ccc';
</script>

<header>
	<h1>Гардероб</h1>
	<p class="sub-head">{countText}</p>
</header>

{#if wardrobe.error}<div class="banner">{wardrobe.error}</div>{/if}

{#if wardrobe.items.length}
	<div class="chips" role="group" aria-label="Фильтр">
		<button class="chip" type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>Все</button>
		{#if secondCount}
			<button class="chip" type="button" aria-pressed={filter === 'second'} onclick={() => (filter = 'second')}>Второй слой</button>
		{/if}
		{#each presentCats as [k, l] (k)}
			<button class="chip" type="button" aria-pressed={filter === k} onclick={() => (filter = k)}>{l}</button>
		{/each}
	</div>
{/if}

<main>
	{#if wardrobe.loaded && !wardrobe.items.length}
		<div class="empty">
			<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 20a5 5 0 1 0-5-5M32 20v6L8 44a3 3 0 0 0 2 5h44a3 3 0 0 0 2-5L32 26" /></svg>
			<h2>Начни с одной вещи</h2>
			<p>Опиши её словами или загрузи скриншот из магазина — найду аккуратное фото, уберу фон и заполню карточку.</p>
		</div>
	{:else}
		<div class="grid">
			{#each shown as it (it.id)}
				<button class="card" type="button" onclick={() => open(it)}>
					{#if layerOf(it.category) === 'second'}<span class="badge">2-й слой</span>{/if}
					<img src={wardrobe.url(it)} alt={it.name} />
					<div class="meta">
						{#if it.brand}<div class="br">{it.brand}</div>{/if}
						<div class="nm">{it.name}</div>
						<div class="sub">
							<span class="dots">
								{#each it.colors.slice(0, 3) as c (c)}<span class="dot" style="background:{colorCss(c)}"></span>{/each}
							</span>
							<span>{catLabel(it.category)}</span>
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</main>

<div class="bar">
	<button class="btn primary" type="button" onclick={() => (adding = true)}>Добавить вещь</button>
</div>

{#if adding}
	<AddFlow onclose={() => (adding = false)} />
{/if}

{#if editing && draft}
	<Sheet onclose={close} label="Карточка вещи">
		<ItemForm
			bind:draft
			photoUrl={wardrobe.url(editing)}
			isNew={false}
			{saving}
			onsave={save}
			onclose={close}
			onwear={wear}
			ondelete={remove}
		/>
	</Sheet>
{/if}
