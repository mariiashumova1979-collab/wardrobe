<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { wardrobe, type Item } from '../store.svelte';
	import { showToast } from '../toast.svelte';
	import { BANDS, ROLE_GEN, ROLE_LABEL, bandOf, planOutfits, type Band, type Need, type Outfit, type Plan } from '../outfits';
	import { PLACE, describeCode, isRainy, loadWeather, referenceTemp, type Weather } from '../weather';
	import { COLORS } from '../taxonomy';

	let { ongaps }: { ongaps?: () => void } = $props();

	let weather = $state<Weather | null>(null);
	let stale = $state(false);
	let failed = $state(false);
	let loading = $state(true);
	let manual = $state<Band | null>(null);
	let round = $state(0);
	let plan = $state.raw<Plan<Item> | null>(null);
	let worn = $state<number[]>([]);

	onMount(async () => {
		try {
			const r = await loadWeather();
			weather = r.weather;
			stale = r.stale;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	});

	const auto = $derived(weather ? bandOf(referenceTemp(weather)) : null);
	const band = $derived(manual ?? auto);

	// Пересчёт только при смене погоды, режима или нажатии «Другие варианты».
	// После «Надела» вещи меняются, но набор на экране не прыгает.
	$effect(() => {
		const b = band;
		const r = round;
		if (!b || !wardrobe.loaded) {
			plan = null;
			return;
		}
		worn = [];
		plan = untrack(() =>
			planOutfits(wardrobe.items, b, {
				min: weather?.feelsMin,
				rain: weather ? isRainy(weather) : false,
				seed: `${new Date().toDateString()}#${r}`
			})
		);
	});

	const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
	const colorCss = (k: string) => COLORS.find((c) => c[0] === k)?.[2] ?? '#ccc';
	// «Синий / голубой» → «синий»
	const colorName = (k: string | null) => COLORS.find((c) => c[0] === k)?.[1].split('/')[0].trim().toLowerCase() ?? '';

	function rule(n: Need, b: Band, w: Weather | null, auto: boolean) {
		const second = n.second === 'required' ? 'второй слой обязателен' : n.second === 'optional' ? 'второй слой по желанию: вечером прохладнее' : 'без второго слоя';
		const lead = auto && w ? `Ориентируюсь на ощущаемые ${referenceTemp(w)}°. ` : `${BANDS.find((x) => x.id === b)!.hint}. `;
		return `${lead}${second[0].toUpperCase()}${second.slice(1)}, ${n.outer ? 'нужна куртка' : 'куртка не нужна'}.`;
	}
	const palette = (o: Outfit<Item>) =>
		o.palette === 'neutral' ? 'Спокойная палитра' : o.palette === 'accent' ? `Акцент: ${colorName(o.accent)}` : 'Два цветных акцента';

	async function wear(o: Outfit<Item>, i: number) {
		try {
			const now = Date.now();
			for (const p of o.parts) {
				const cur = wardrobe.items.find((x) => x.id === p.item.id);
				if (cur) await wardrobe.update({ ...cur, wearCount: cur.wearCount + 1, lastWorn: now });
			}
			worn = [...worn, i];
			showToast('Отмечено: надела сегодня');
		} catch {
			showToast('Не удалось сохранить');
		}
	}
</script>

<header>
	<h1>Что надеть</h1>
	<p class="sub-head">{PLACE.name} · {today}</p>
</header>

<section class="wx" aria-live="polite">
	{#if weather}
		<div class="big">{Math.round(weather.tempNow)}°</div>
		<div class="wd">
			<b>{describeCode(weather.code)}</b>
			<span>Днём до {Math.round(weather.max)}°, ночью {Math.round(weather.min)}°</span>
			<span>Ощущается как {Math.round(weather.feelsNow)}° · осадки {weather.rainChance}%</span>
		</div>
	{:else if loading}
		<div class="wd"><b><span class="spin"></span>Загружаю погоду…</b></div>
	{:else}
		<div class="wd">
			<b>Погода не загрузилась</b>
			<span>Выбери, какая она сегодня, вручную.</span>
		</div>
	{/if}
</section>
{#if stale}<div class="hint">Нет связи, показываю погоду, сохранённую раньше.</div>{/if}

<div class="chips" role="group" aria-label="Какая погода">
	{#each BANDS as b (b.id)}
		<button class="chip" type="button" aria-pressed={band === b.id} onclick={() => (manual = b.id === auto ? null : b.id)}>
			{b.label}
		</button>
	{/each}
</div>

<main>
	{#if wardrobe.loaded && !wardrobe.items.length}
		<div class="empty">
			<h2>Пока не из чего выбирать</h2>
			<p>Добавь в гардероб верх, низ и обувь, и я соберу комплекты под погоду.</p>
		</div>
	{:else if plan}
		<p class="hint rule">{rule(plan.need, band!, weather, !manual && !!weather)}</p>

		{#if plan.relaxed}
			<div class="banner">Вещей под такую погоду маловато: часть образов собрана из вещей других сезонов.</div>
		{/if}
		{#if plan.outfits.length && plan.missing.length}
			<div class="banner">
				Нет подходящих вещей: {plan.missing.map((r) => ROLE_GEN[r]).join(', ')}. Без этого образы получаются неполными.
			</div>
		{/if}

		{#each plan.outfits as o, i (o.parts.map((p) => p.item.id).join())}
			<article class="look">
				<div class="lh">
					<b>Вариант {i + 1}</b>
					<span class="tags">
						<span class="tag">{palette(o)}</span>
						{#if o.fresh === 'long'}<span class="tag">Есть вещь, которую давно не надевала</span>{/if}
					</span>
				</div>
				<div class="parts" style="--n:{o.parts.length}">
					{#each o.parts as p (p.role + p.item.id)}
						<div class="part">
							<img src={wardrobe.url(p.item)} alt={p.item.name} />
							<span class="role">{ROLE_LABEL[p.role]}</span>
							<span class="pn">{p.item.brand ? p.item.brand + ' ' : ''}{p.item.name}</span>
							<span class="dots">
								{#each p.item.colors.slice(0, 3) as c (c)}<span class="dot" style="background:{colorCss(c)}"></span>{/each}
							</span>
						</div>
					{/each}
				</div>
				<button class="btn" type="button" disabled={worn.includes(i)} onclick={() => wear(o, i)}>
					{worn.includes(i) ? 'Отмечено' : 'Надену это'}
				</button>
			</article>
		{:else}
			<div class="empty">
				<h2>Не получилось собрать</h2>
				<p>
					{#if plan.missing.length}
						Для такой погоды в гардеробе нет: {plan.missing.map((r) => ROLE_GEN[r]).join(', ')}.
					{:else}
						Вещи не сочетаются между собой по цвету. Подробнее в разделе «Дыры».
					{/if}
				</p>
				{#if ongaps}<button class="btn" type="button" style="margin-top:14px" onclick={ongaps}>Что докупить</button>{/if}
			</div>
		{/each}

		{#if plan.outfits.length}
			<button class="btn ghost" type="button" style="width:100%;margin-top:6px" onclick={() => round++}>Другие варианты</button>
		{/if}
	{/if}
	<div class="credit">Погода: Open-Meteo.com</div>
</main>
