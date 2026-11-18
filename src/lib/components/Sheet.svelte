<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, onclose, label }: { children: Snippet; onclose: () => void; label: string } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div
	class="scrim"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
		{@render children()}
	</div>
</div>
