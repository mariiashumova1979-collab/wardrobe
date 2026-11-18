<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { auth, setAccessCode } from '../lib/api.svelte';
	import { toast } from '../lib/toast.svelte';
	import Sheet from '../lib/components/Sheet.svelte';

	let { children }: LayoutProps = $props();
	let code = $state('');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

{#if auth.needed}
	<Sheet onclose={() => (auth.needed = false)} label="Код доступа">
		<h2>Код доступа</h2>
		<p class="hint" style="margin:0 0 4px">Поиск и разметка тратят платные ключи, поэтому приложение закрыто кодом. Введи его один раз, он запомнится на этом устройстве.</p>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				if (code.trim()) {
					setAccessCode(code);
					code = '';
				}
			}}
		>
			<input class="in" type="password" autocomplete="current-password" aria-label="Код доступа" bind:value={code} />
			<div class="actions"><button class="btn primary" type="submit" disabled={!code.trim()}>Сохранить код</button></div>
		</form>
		<div class="hint">После этого повтори последнее действие.</div>
	</Sheet>
{/if}

{#if toast.message}
	<div class="toast" role="status">{toast.message}</div>
{/if}
