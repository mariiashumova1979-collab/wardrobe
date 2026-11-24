<script lang="ts">
	import { wardrobe } from '../store.svelte';
	import { ENOUGH, analyzeGaps, type BandReport } from '../gaps';
	import { ROLE_GEN, ROLE_LABEL, ROLE_ORDER } from '../outfits';
	import { COLORS, pluralRu } from '../taxonomy';

	const report = $derived(wardrobe.loaded ? analyzeGaps(wardrobe.items) : null);
	const colorCss = (k: string) => COLORS.find((c) => c[0] === k)?.[2] ?? '#ccc';
	const LEVEL = { none: 'Нечего надеть', few: 'Мало', ok: 'Хватает' } as const;
	function detail(b: BandReport) {
		const n = b.looks >= ENOUGH ? `${ENOUGH}+ образов` : b.looks ? pluralRu(b.looks, ['образ', 'образа', 'образов']) : 'Образов нет';
		return b.missing.length ? `${n} · не хватает: ${b.missing.map((r) => ROLE_GEN[r]).join(', ')}` : n;
	}
	const allOk = $derived(!!report && !report.tooFew && report.bands.every((b) => b.level === 'ok'));
</script>

<header>
	<h1>Дыры в гардеробе</h1>
	<p class="sub-head">Чего не хватает, чтобы вещи сочетались между собой</p>
</header>

<main>
	{#if !report}
		<div class="empty"><p>Загружаю…</p></div>
	{:else if report.tooFew}
		<div class="empty">
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

		<h3 class="sec">Что докупить в первую очередь</h3>
		{#if report.buy.length}
			<div class="buy">
				{#each report.buy as b (b.category)}
					<div class="by">
						<span class="sw" style="background:{colorCss(b.color)}"></span>
						<div>
							<b>{b.title}</b>
							<span class="mute">{b.examples}</span>
							<span>{b.why}</span>
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
	{/if}
</main>
