<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { sync } from '../sync.svelte';
	import { wardrobe } from '../store.svelte';
	import { pluralRu } from '../taxonomy';

	let { onclose }: { onclose: () => void } = $props();

	const lastText = $derived(
		sync.last ? 'Последний обмен: ' + new Date(sync.last).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Обмена ещё не было'
	);
</script>

<Sheet {onclose} label="Синхронизация">
	<h2>Синхронизация</h2>
	{#if !sync.enabled}
		<p class="hint" style="margin:0 0 8px">
			Вещи с фото, журнал носки и список желаемого будут храниться в твоём закрытом хранилище на Vercel и подтягиваться на другие устройства, где включена синхронизация.
			Пока она выключена, ничего не отправляется: всё лежит только в этом браузере.
		</p>
		<div class="actions"><button class="btn primary" type="button" onclick={() => sync.enable()}>Включить синхронизацию</button></div>
		<div class="hint">На втором устройстве открой приложение, введи тот же код доступа и тоже включи синхронизацию.</div>
	{:else}
		<p class="sync-state" data-status={sync.status} role="status">
			{#if sync.status === 'syncing'}
				{sync.progress || 'Синхронизирую…'}
			{:else if sync.status === 'ok'}
				Всё синхронизировано
			{:else if sync.status === 'unconfigured'}
				Хранилище не подключено
			{:else if sync.status === 'error'}
				Не получилось: {sync.message}
			{:else}
				Включена
			{/if}
		</p>
		{#if sync.status === 'unconfigured'}
			<p class="hint" style="margin:0 0 8px">{sync.message}</p>
		{/if}
		<div class="hint" style="margin:0 0 12px">
			{lastText}. На этом устройстве {pluralRu(wardrobe.items.length, ['вещь', 'вещи', 'вещей'])}.
		</div>
		<div class="actions">
			<button class="btn primary" type="button" disabled={sync.status === 'syncing'} onclick={() => sync.run()}>Синхронизировать сейчас</button>
			<button class="btn ghost" type="button" onclick={() => sync.disable()}>Выключить на этом устройстве</button>
		</div>
		<div class="hint">Выключение ничего не удаляет ни здесь, ни в хранилище.</div>
	{/if}
</Sheet>
