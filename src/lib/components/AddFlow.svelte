<script lang="ts">
	import { ApiError, fetchImage, identify, searchImages, tagImage, type SearchResult } from '../api.svelte';
	import { blobToDataURL, cutout, shrink } from '../image';
	import { wardrobe, type Item } from '../store.svelte';
	import { showToast } from '../toast.svelte';
	import { catLabel, type Attrs } from '../taxonomy';
	import type { Draft, TagStatus } from '../types';
	import Sheet from './Sheet.svelte';
	import ItemForm from './ItemForm.svelte';

	let { onclose }: { onclose: () => void } = $props();

	const BG_KEY = 'wardrobe-removebg';
	const blank = (): Draft => ({ name: '', category: '', colors: [], material: '', seasons: [], formality: '', wearCount: 0 });

	let step = $state<'query' | 'results' | 'edit'>('query');
	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let own = $state<{ blob: Blob; url: string } | null>(null);
	let removeBg = $state(localStorage.getItem(BG_KEY) !== '0');
	let busy = $state(''); // что делаем прямо сейчас
	let progress = $state<number | null>(null);
	let error = $state('');

	let draft = $state<Draft>(blank());
	let photo = $state<Blob | null>(null);
	let photoUrl = $state('');
	let tagStatus = $state<TagStatus>('idle');
	let saving = $state(false);

	const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Что-то пошло не так, попробуй ещё раз');

	function setRemoveBg(v: boolean) {
		removeBg = v;
		localStorage.setItem(BG_KEY, v ? '1' : '0');
	}

	async function search(q: string) {
		const text = q.trim();
		if (!text) return;
		error = '';
		busy = 'Ищу фото…';
		try {
			results = (await searchImages(text)).results;
			if (!results.length) error = 'Ничего не нашлось — попробуй описать иначе: бренд, цвет, крой.';
			step = 'results';
		} catch (e) {
			error = message(e);
		} finally {
			busy = '';
		}
	}

	async function onOwnFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		error = '';
		busy = 'Определяю вещь…';
		try {
			const big = await shrink(file, 1024, { flatten: true, quality: 0.9 });
			if (own) URL.revokeObjectURL(own.url);
			own = { blob: big, url: URL.createObjectURL(big) };
			const small = await shrink(big, 640, { flatten: true });
			const { query: q } = await identify(await blobToDataURL(small));
			query = q;
			busy = '';
			await search(q);
		} catch (err) {
			busy = '';
			error = message(err);
			// своё фото уже загружено — даже без запроса его можно выбрать
			if (own) step = 'results';
		}
	}

	async function choose(r: SearchResult | null) {
		error = '';
		progress = null;
		try {
			busy = 'Скачиваю фото…';
			const source = r ? await fetchImage(r.full) : own!.blob;
			const base = await shrink(source, 1024, { flatten: true, quality: 0.9 });

			let final: Blob;
			if (removeBg) {
				busy = 'Убираю фон…';
				try {
					const cut = await cutout(base, (f) => (progress = f));
					final = await shrink(cut, 800, { type: 'image/webp', quality: 0.85 });
				} catch {
					showToast('Фон убрать не получилось — оставила фото как есть');
					final = await shrink(base, 800, { quality: 0.85 });
				}
			} else {
				final = await shrink(base, 800, { quality: 0.85 });
			}
			progress = null;

			photo = final;
			if (photoUrl) URL.revokeObjectURL(photoUrl);
			photoUrl = URL.createObjectURL(final);
			draft = blank();
			step = 'edit';
			busy = '';
			tag(final);
		} catch (e) {
			busy = '';
			progress = null;
			error = message(e);
		}
	}

	async function tag(blob: Blob) {
		tagStatus = 'tagging';
		try {
			const input = await blobToDataURL(await shrink(blob, 640, { flatten: true }));
			apply(await tagImage(input, query));
			tagStatus = 'done';
		} catch (e) {
			tagStatus = 'failed';
			if (e instanceof ApiError && e.status !== 401) showToast(e.message);
		}
	}

	// Подставляем только в пустые поля: если человек уже что-то ввёл, не затираем.
	function apply(t: Partial<Attrs>) {
		if (!draft.name && t.name) draft.name = t.name;
		if (!draft.category && t.category) draft.category = t.category;
		if (!draft.colors.length && t.colors) draft.colors = t.colors;
		if (!draft.material && t.material) draft.material = t.material;
		if (!draft.seasons.length && t.seasons) draft.seasons = t.seasons;
		if (!draft.formality && t.formality) draft.formality = t.formality;
	}

	async function save() {
		if (!photo) return;
		saving = true;
		const item: Item = {
			id: crypto.randomUUID(),
			photo,
			name: draft.name.trim() || catLabel(draft.category),
			category: draft.category,
			colors: [...draft.colors],
			material: draft.material.trim(),
			seasons: [...draft.seasons],
			formality: draft.formality || 'casual',
			createdAt: Date.now(),
			wearCount: 0,
			lastWorn: null,
			origin: own && !results.length ? 'own' : query
		};
		try {
			await wardrobe.add(item);
			showToast('Добавлено в гардероб');
			onclose();
		} catch {
			saving = false;
			showToast('Не удалось сохранить — возможно, закончилось место в браузере');
		}
	}
</script>

<Sheet {onclose} label="Добавить вещь">
	{#if step === 'edit'}
		<ItemForm bind:draft {photoUrl} isNew {tagStatus} {saving} onsave={save} {onclose} />
	{:else if busy}
		<div class="working" aria-live="polite">
			<b><span class="spin"></span>{busy}</b>
			{#if busy === 'Убираю фон…'}
				<span>Первый раз дольше: загружается модель.</span>
				{#if progress !== null}<div class="bar-progress"><i style="width:{Math.round(progress * 100)}%"></i></div>{/if}
			{/if}
		</div>
	{:else if step === 'query'}
		<h2>Добавить вещь</h2>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				search(query);
			}}
		>
			<label class="f" for="q">Что за вещь?</label>
			<input id="q" class="in" type="text" maxlength="200" placeholder="Например: белая рубашка Zara оверсайз" bind:value={query} />
			<div class="actions">
				<button class="btn primary" type="submit" disabled={!query.trim()}>Найти фото</button>
			</div>
		</form>
		<div class="divider">или</div>
		<label class="btn" style="display:block" for="own">Загрузить скриншот или своё фото</label>
		<input id="own" type="file" accept="image/*" onchange={onOwnFile} />
		<div class="hint">Определю вещь по картинке и найду для неё аккуратное фото.</div>
		<label class="check"><input type="checkbox" checked={removeBg} onchange={(e) => setRemoveBg(e.currentTarget.checked)} /> Убирать фон</label>
		{#if error}<div class="err" role="alert">{error}</div>{/if}
		<div class="actions"><button class="btn ghost" type="button" onclick={onclose}>Закрыть</button></div>
	{:else}
		<h2>Выбери фото</h2>
		<div class="hint" style="margin:0 0 12px">«{query}»</div>
		<div class="grid three">
			{#if own}
				<button class="tile" type="button" onclick={() => choose(null)}>
					<img src={own.url} alt="Моё фото" /><span class="cap">Моё фото</span>
				</button>
			{/if}
			{#each results as r (r.id)}
				<button class="tile" type="button" onclick={() => choose(r)} title={r.source}>
					<img src={r.thumb} alt={r.title} loading="lazy" referrerpolicy="no-referrer" />
				</button>
			{/each}
		</div>
		{#if error}<div class="err" role="alert">{error}</div>{/if}
		<div class="actions">
			<button class="btn" type="button" onclick={() => ((step = 'query'), (error = ''))}>Другой запрос</button>
			<button class="btn ghost" type="button" onclick={onclose}>Закрыть</button>
		</div>
		<div class="credit">Поиск фото: Brave Search</div>
	{/if}
</Sheet>
