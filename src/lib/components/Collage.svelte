<script lang="ts">
	import type { Item } from '../store.svelte';
	import { wardrobe } from '../store.svelte';
	import { flatlay } from '../collage';
	import { isCutout } from '../image';
	import type { Role } from '../outfits';

	let { parts }: { parts: { role: Role; item: Item }[] } = $props();

	const slots = $derived(flatlay(parts.map((p) => p.role)));
	const byRole = $derived(new Map(parts.map((p) => [p.role, p.item])));
	// вещь с вырезанным фоном получает мягкую тень, фото с фоном «растворяется» на доске
	let cut = $state<Record<string, boolean>>({});
	$effect(() => {
		for (const p of parts) {
			const id = p.item.id;
			if (id in cut) continue;
			isCutout(p.item.photo).then((v) => (cut[id] = v));
		}
	});
</script>

<div class="board" role="img" aria-label={parts.map((p) => p.item.name).join(', ')}>
	{#each slots as s (s.role)}
		{@const item = byRole.get(s.role)!}
		<img
			class="pc"
			data-cut={cut[item.id] ? 'yes' : 'no'}
			src={wardrobe.url(item)}
			alt=""
			style="left:{s.left}%;top:{s.top}%;width:{s.width}%;height:{s.height}%;z-index:{s.z};transform:rotate({s.rot}deg)"
		/>
	{/each}
</div>
