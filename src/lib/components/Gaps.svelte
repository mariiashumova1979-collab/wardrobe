<script lang="ts">
	import { wardrobe } from '../store.svelte';
	import { wishlist, type Wish } from '../wishlist.svelte';
	import { ENOUGH, analyzeGaps, wishGain, type BandReport } from '../gaps';
	import { ROLE_GEN, ROLE_LABEL, ROLE_ORDER } from '../outfits';
	import { COLORS, catLabel, pluralRu } from '../taxonomy';
	import { showToast } from '../toast.svelte';
	import AddFlow from './AddFlow.svelte';
	import WishSheet from './WishSheet.svelte';
	import Shots from './Shots.svelte';

	const report = $derived(wardrobe.loaded ? analyzeGaps(wardrobe.items, wishlist.hidden) : null);
	const gains = $derived(new Map(wishlist.wishes.map((w) => [w.id, w.category ? wishGain(wardrobe.items, w) : null])));
	const colorCss = (k: string) => COLORS.find((c) => c[0] === k)?.[2] ?? '#ccc';
	const colorName = (k: string) => COLORS.find((c) => c[0] === k)?.[1].split('/')[0].trim().toLowerCase() ?? '';
	const LEVEL = { none: 'Нечего надеть', few: 'Мало', ok: 'Хватает' } as const;
	const allOk = $derived(!!report && !report.tooFew && report.bands.every((b) => b.level === 'ok'));

	let sheet = $state<{ wish: Wish | null; preset?: { title: string; category: string; color: string } } | null>(null);
	let buying = $state<Wish | null>(null);

	function detail(b: BandReport) {
		const n = b.looks >= ENOUGH ? `${ENOUGH}+ образов` : b.looks ? pluralRu(b.looks, ['образ', 'образа', 'образов']) : 'Образов нет';
		return b.missing.length ? `${n} · не хватает: ${b.missing.map((r) => ROLE_GEN[r]).join(', ')}` : n;
	}
	function gainText(g: number | null | undefined) {
		if (g == null) return 'В образы не входит, на подбор не влияет.';
		if (g <= 0) return 'Новых образов не добавит: похожего у тебя уже хватает.';
		return `Даст ещё ${pluralRu(g, ['образ', 'образа', 'образов'])} на разную погоду.`;
	}
	const inList = (category: string, color: string) => wishlist.wishes.some((w) => w.category === category && w.color === color);

	async function guard(fn: () => Promise<unknown>) {
		try {
			await fn();
		} catch {
			showToast('Не удалось сохранить');
		}
	}
</script>

<header>
	<h1>Дыры в гардеробе</h1>
	<p class="sub-head">Чего не хватает, чтобы вещи сочетались между собой</p>
</header>

<main>
	{#if !report}
		<div class="empty"><p>Загружаю…</p></div>
	{:else if report.tooFew}
		<div class="empty" style="padding:28px 24px">
			<h2>Пока рано считать</h2>
			<p>Добавь хотя бы три вещи, например верх, низ и обувь, и я покажу, чего не хватает.</p>
		</div>
	{:else}
		<h3 class="sec">Образов по погоде</h3>
		<div class="bands">
			{#each report.bands as b (b.band)}
				<div class="band" data-level={b.level}>
					<div class="bt">
						<b>{b.label}</b><span class="mute">{b.hint}</span>
						<span class="lv">{LEVEL[b.level]}</span>
					</div>
					<div class="meter" role="img" aria-label="{b.looks >= ENOUGH ? ENOUGH + ' и больше' : b.looks} образов">
						<i style="width:{Math.round((Math.min(b.looks, ENOUGH) / ENOUGH) * 100)}%"></i>
					</div>
					<div class="hint" style="margin-top:6px">{detail(b)}</div>
				</div>
			{/each}
		</div>
		<div class="hint counts">
			{ROLE_ORDER.map((r) => `${ROLE_LABEL[r]} ${report.counts[r]}`).join(' · ')}
		</div>
	{/if}

	<div class="sec-row">
		<h3 class="sec">Мой список</h3>
		<button class="btn small" type="button" onclick={() => (sheet = { wish: null })}>+ Добавить</button>
	</div>
	{#if wishlist.wishes.length}
		<div class="buy">
			{#each wishlist.wishes as w (w.id)}
				<button class="by wish" type="button" onclick={() => (sheet = { wish: w })}>
					{#if w.photos.length}
						<span class="wthumb"><Shots photos={w.photos} small /></span>
					{:else}
						<span class="sw" style="background:{w.color ? colorCss(w.color) : 'transparent'}" data-any={!w.color}></span>
					{/if}
					<div>
						<b>{w.title}</b>
						{#if w.category}<span class="mute">{catLabel(w.category)}{w.color ? ' · ' + colorName(w.color) : ''}</span>{/if}
						{#if w.note}<span>{w.note}</span>{/if}
						{#if w.category}<span class="gain">{gainText(gains.get(w.id))}</span>{/if}
					</div>
				</button>
			{/each}
		</div>
	{:else}
		<p class="hint" style="margin-top:0">
			Добавь то, что считаешь нужным: покажу, сколько образов это даст с тем, что уже есть.
		</p>
	{/if}

	{#if report && !report.tooFew}
		{#if report.orphans.length}
			<h3 class="sec">Вещи без пары</h3>
			<p class="hint" style="margin-top:0">С ними пока не из чего собрать образ.</p>
			<div class="orph">
				{#each report.orphans as o (o.item.id)}
					<div class="op">
						<img src={wardrobe.url(o.item)} alt={o.item.name} />
						<div><b>{o.item.brand ? o.item.brand + ' ' : ''}{o.item.name}</b><span>{o.why}</span></div>
					</div>
				{/each}
			</div>
		{/if}

		<h3 class="sec">Что я советую докупить</h3>
		{#if report.buy.length}
			<div class="buy">
				{#each report.buy as b (b.category)}
					<div class="by">
						<span class="sw" style="background:{colorCss(b.color)}"></span>
						<div>
							<b>{b.title}</b>
							<span class="mute">{b.examples}</span>
							<span>{b.why}</span>
							<span class="acts">
								<button
									class="chip"
									type="button"
									disabled={inList(b.category, b.color)}
									onclick={() => guard(() => wishlist.add({ title: b.title, category: b.category, color: b.color, note: '', photos: [] }).then(() => showToast('Добавила в мой список')))}
								>
									{inList(b.category, b.color) ? 'В списке' : 'В мой список'}
								</button>
								<button class="chip" type="button" onclick={() => guard(() => wishlist.hide(b.category))}>Не нужно</button>
							</span>
						</div>
					</div>
				{/each}
			</div>
			<p class="hint">Советую нейтральные цвета: они сочетаются с самым большим числом вещей.</p>
		{:else if allOk}
			<p class="hint" style="margin-top:0">Серьёзных дыр не вижу: образов хватает на любую погоду.</p>
		{:else}
			<p class="hint" style="margin-top:0">Одна новая вещь заметно ничего не изменит. Лучше добавь в гардероб то, что уже есть.</p>
		{/if}

		{#if wishlist.hidden.length}
			<p class="hint" style="margin-bottom:6px">Не предлагаю:</p>
			<div class="chips" style="margin:0">
				{#each wishlist.hidden as c (c)}
					<button class="chip" type="button" onclick={() => guard(() => wishlist.unhide(c))}>Вернуть: {catLabel(c).split('/')[0].trim().toLowerCase()}</button>
				{/each}
			</div>
		{/if}
	{/if}
</main>

{#if sheet}
	<WishSheet
		wish={sheet.wish}
		preset={sheet.preset}
		onclose={() => (sheet = null)}
		onbought={(w) => {
			sheet = null;
			buying = w;
		}}
	/>
{/if}

{#if buying}
	{@const w = buying}
	<AddFlow initialQuery={w.title} onclose={() => (buying = null)} onsaved={() => guard(() => wishlist.remove(w.id))} />
{/if}
