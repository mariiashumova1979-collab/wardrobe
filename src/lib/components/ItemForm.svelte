<script lang="ts">
	import { CATS, COLORS, SEASONS, FORMAL, catLabel, layerOf, pluralRu } from '../taxonomy';
	import { showToast } from '../toast.svelte';
	import type { Draft, TagStatus } from '../types';

	let {
		draft = $bindable(),
		photoUrl,
		isNew,
		tagStatus = 'idle',
		saving = false,
		onsave,
		onclose,
		onwear,
		ondelete
	}: {
		draft: Draft;
		photoUrl: string;
		isNew: boolean;
		tagStatus?: TagStatus;
		saving?: boolean;
		onsave: () => void;
		onclose: () => void;
		onwear?: () => void;
		ondelete?: () => void;
	} = $props();

	let confirmDelete = $state(false);

	const layer = $derived(layerOf(draft.category));
	const canSave = $derived(!!draft.category && tagStatus !== 'tagging' && !saving);

	function toggleColor(k: string) {
		if (draft.colors.includes(k)) draft.colors = draft.colors.filter((x) => x !== k);
		else if (draft.colors.length < 3) draft.colors = [...draft.colors, k];
		else showToast('Не больше трёх цветов');
	}
	function toggleSeason(k: string) {
		draft.seasons = draft.seasons.includes(k) ? draft.seasons.filter((x) => x !== k) : [...draft.seasons, k];
	}
</script>

<div class="top">
	<img src={photoUrl} alt="" />
	<div class="status">
		{#if tagStatus === 'tagging'}
			<b><span class="spin"></span>Разбираю вещь…</b>Заполню название, цвет и сезон — потом всё можно поправить.
		{:else if tagStatus === 'failed'}
			<b>Не получилось определить</b>Заполни поля вручную — это займёт десять секунд.
		{:else if tagStatus === 'done'}
			<b>Готово</b>Проверь, всё ли верно, и поправь, если нет.
		{:else}
			<b>{draft.brand ? draft.brand + ' · ' : ''}{draft.name || catLabel(draft.category)}</b>
			{draft.wearCount ? 'Надето ' + pluralRu(draft.wearCount, ['раз', 'раза', 'раз']) : 'Ещё не надевала'}
		{/if}
	</div>
</div>

<label class="f" for="f-name">Название</label>
<input id="f-name" class="in" type="text" maxlength="60" placeholder="Например: белая рубашка оверсайз" bind:value={draft.name} />

<label class="f" for="f-brand">Бренд</label>
<input id="f-brand" class="in" type="text" maxlength="40" placeholder="Например: Zara, Levi's" autocomplete="off" bind:value={draft.brand} />

<label class="f" for="f-cat">Категория</label>
<select id="f-cat" class="in" bind:value={draft.category}>
	<option value="">Выбери категорию</option>
	{#each CATS as [k, l] (k)}<option value={k}>{l}</option>{/each}
</select>
{#if draft.category}
	<div class="hint">
		{layer === 'second' ? 'Подходит как второй слой.' : layer === 'outer' ? 'Верхняя одежда — в слои не входит.' : 'Базовый слой.'}
	</div>
{/if}

<span class="f">Цвет (до трёх)</span>
<div class="pick">
	{#each COLORS as [k, l, css] (k)}
		<button class="opt" type="button" aria-pressed={draft.colors.includes(k)} onclick={() => toggleColor(k)}>
			<span class="dot" style="background:{css}"></span>{l}
		</button>
	{/each}
</div>

<label class="f" for="f-mat">Материал</label>
<input id="f-mat" class="in" type="text" maxlength="40" placeholder="Хлопок, шерсть, лён…" bind:value={draft.material} />

<span class="f">Сезон</span>
<div class="pick">
	{#each SEASONS as [k, l] (k)}
		<button class="opt" type="button" aria-pressed={draft.seasons.includes(k)} onclick={() => toggleSeason(k)}>{l}</button>
	{/each}
</div>

<label class="f" for="f-form">Формальность</label>
<select id="f-form" class="in" bind:value={draft.formality}>
	<option value="">Не указано</option>
	{#each FORMAL as [k, l] (k)}<option value={k}>{l}</option>{/each}
</select>

<div class="actions">
	<button class="btn primary" type="button" disabled={!canSave} onclick={onsave}>
		{isNew ? 'Добавить в гардероб' : 'Сохранить'}
	</button>
	{#if !isNew}
		<button class="btn" type="button" onclick={onwear}>Надела сегодня</button>
		{#if confirmDelete}
			<div class="row">
				<button class="btn ghost" type="button" onclick={() => (confirmDelete = false)}>Оставить</button>
				<button class="btn danger" type="button" onclick={ondelete}>Удалить насовсем</button>
			</div>
		{:else}
			<button class="btn ghost danger" type="button" onclick={() => (confirmDelete = true)}>Удалить вещь</button>
		{/if}
	{/if}
	<button class="btn ghost" type="button" onclick={onclose}>Закрыть</button>
</div>
