<script lang="ts">
	import { wishlist, type Wish } from '../wishlist.svelte';
	import { showToast } from '../toast.svelte';
	import { CATS, COLORS, catLabel } from '../taxonomy';
	import Sheet from './Sheet.svelte';

	let {
		wish,
		preset,
		onclose,
		onbought
	}: {
		/** Редактируемая запись; null — новая. */
		wish: Wish | null;
		preset?: Partial<Pick<Wish, 'title' | 'category' | 'color'>>;
		onclose: () => void;
		onbought: (w: Wish) => void;
	} = $props();

	/* svelte-ignore state_referenced_locally */
	let title = $state(wish?.title ?? preset?.title ?? '');
	/* svelte-ignore state_referenced_locally */
	let category = $state(wish?.category ?? preset?.category ?? '');
	/* svelte-ignore state_referenced_locally */
	let color = $state(wish?.color ?? preset?.color ?? '');
	/* svelte-ignore state_referenced_locally */
	let note = $state(wish?.note ?? '');
	let confirmDelete = $state(false);
	let saving = $state(false);

	const colorName = (k: string) => COLORS.find((c) => c[0] === k)?.[1].split('/')[0].trim().toLowerCase() ?? '';
	const autoTitle = $derived([colorName(color), category ? catLabel(category).split('/')[0].trim().toLowerCase() : ''].filter(Boolean).join(' '));
	const canSave = $derived(!!category && (!!title.trim() || !!autoTitle) && !saving);

	async function save() {
		if (!canSave) return;
		saving = true;
		const data = {
			title: title.trim() || autoTitle.replace(/^./, (c) => c.toUpperCase()),
			category,
			color,
			note: note.trim()
		};
		try {
			if (wish) await wishlist.update({ ...wish, ...data });
			else await wishlist.add(data);
			showToast('Сохранено в списке');
			onclose();
		} catch {
			saving = false;
			showToast('Не удалось сохранить');
		}
	}
	async function remove() {
		if (!wish) return;
		try {
			await wishlist.remove(wish.id);
			onclose();
		} catch {
			showToast('Не удалось удалить');
		}
	}
</script>

<Sheet {onclose} label={wish ? 'Изменить запись' : 'Что докупить'}>
	<h2>{wish ? 'Изменить запись' : 'Что докупить'}</h2>

	<label class="f" for="w-cat">Категория</label>
	<select id="w-cat" class="in" bind:value={category}>
		<option value="">Выбери категорию</option>
		{#each CATS as [k, l] (k)}<option value={k}>{l}</option>{/each}
	</select>

	<span class="f">Цвет</span>
	<div class="pick">
		<button class="opt" type="button" aria-pressed={color === ''} onclick={() => (color = '')}>Любой</button>
		{#each COLORS as [k, l, css] (k)}
			<button class="opt" type="button" aria-pressed={color === k} onclick={() => (color = k)}>
				<span class="dot" style="background:{css}"></span>{l}
			</button>
		{/each}
	</div>

	<label class="f" for="w-title">Название</label>
	<input id="w-title" class="in" type="text" maxlength="80" placeholder={autoTitle ? autoTitle[0].toUpperCase() + autoTitle.slice(1) : 'Например: белые кеды Veja'} bind:value={title} />

	<label class="f" for="w-note">Заметка</label>
	<input id="w-note" class="in" type="text" maxlength="160" placeholder="Бренд, размер, где присмотрела" bind:value={note} />

	<div class="actions">
		<button class="btn primary" type="button" disabled={!canSave} onclick={save}>{wish ? 'Сохранить' : 'Добавить в список'}</button>
		{#if wish}
			<button class="btn" type="button" onclick={() => onbought(wish)}>Купила: добавить в гардероб</button>
			{#if confirmDelete}
				<div class="row">
					<button class="btn ghost" type="button" onclick={() => (confirmDelete = false)}>Оставить</button>
					<button class="btn danger" type="button" onclick={remove}>Удалить</button>
				</div>
			{:else}
				<button class="btn ghost danger" type="button" onclick={() => (confirmDelete = true)}>Убрать из списка</button>
			{/if}
		{/if}
		<button class="btn ghost" type="button" onclick={onclose}>Закрыть</button>
	</div>
</Sheet>
