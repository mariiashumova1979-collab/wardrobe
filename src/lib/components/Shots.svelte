<script lang="ts">
	import { mosaic, MOSAIC_COLS, MOSAIC_ROWS } from '../collage';
	import { urlOf } from '../image';

	let {
		photos,
		small = false,
		onremove
	}: {
		photos: Blob[];
		/** Миниатюра для карточки списка. */
		small?: boolean;
		onremove?: (i: number) => void;
	} = $props();

	const cells = $derived(mosaic(photos.length));
</script>

{#if photos.length === 1}
	<div class="shot-one" class:small>
		<img src={urlOf(photos[0])} alt="Скриншот" />
		{#if onremove}<button class="x" type="button" aria-label="Убрать скриншот" onclick={() => onremove(0)}>×</button>{/if}
	</div>
{:else if photos.length > 1}
	<div class="mosaic" class:small style="--c:{MOSAIC_COLS};--r:{MOSAIC_ROWS}">
		{#each photos as p, i (i + ':' + urlOf(p))}
			{@const [c, r, cs, rs] = cells[i]}
			<div class="cell" style="grid-column:{c} / span {cs};grid-row:{r} / span {rs}">
				<img src={urlOf(p)} alt="Скриншот {i + 1}" />
				{#if onremove}<button class="x" type="button" aria-label="Убрать скриншот {i + 1}" onclick={() => onremove(i)}>×</button>{/if}
			</div>
		{/each}
	</div>
{/if}
