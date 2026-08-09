<script lang="ts">
	import { onMount } from 'svelte';
	import { sortedStatuses, filteredRepos, store, session, vanishedIds } from '$lib/state.svelte';
	import { suggestDismissed, showSuggestions } from '$lib/suggestDismiss.svelte';
	import { login } from '$lib/api';
	import BoardColumn from './BoardColumn.svelte';
	import SuggestedPanel from './SuggestedPanel.svelte';
	import { Info } from 'lucide-svelte';

	const columns = $derived(
		sortedStatuses().map((status) => ({
			status,
			repos: filteredRepos()
				.filter((r) => store.repos[String(r.databaseId)]?.status === status.id)
				.sort((a, b) => {
					const oa = store.repos[String(a.databaseId)]?.order ?? 0;
					const ob = store.repos[String(b.databaseId)]?.order ?? 0;
					return oa - ob;
				})
		}))
	);
	const vanished = $derived(vanishedIds());
	const hasRepoScope = $derived(session.scopes.includes('repo'));

	// Horizontal auto-scroll: while a card is dragged near the board's edge, the
	// column row scrolls so the card can reach columns off-screen.
	let colsEl: HTMLDivElement;
	let dragging = false;
	let hSpeed = 0;
	let hRaf = 0;

	function onDragStart(): void {
		dragging = true;
	}
	function onDragEnd(): void {
		dragging = false;
		hSpeed = 0;
	}
	function onColsDragOver(e: DragEvent): void {
		if (!dragging || !colsEl) return;
		const r = colsEl.getBoundingClientRect();
		const edge = 90;
		if (e.clientX < r.left + edge) hSpeed = -1;
		else if (e.clientX > r.right - edge) hSpeed = 1;
		else hSpeed = 0;
		if (hSpeed !== 0 && hRaf === 0) hRaf = requestAnimationFrame(hStep);
	}
	function hStep(): void {
		if (!dragging || hSpeed === 0 || !colsEl) {
			hRaf = 0;
			return;
		}
		colsEl.scrollLeft += hSpeed * 10;
		hRaf = requestAnimationFrame(hStep);
	}

	onMount(() => {
		window.addEventListener('dragstart', onDragStart);
		window.addEventListener('dragend', onDragEnd);
		return () => {
			window.removeEventListener('dragstart', onDragStart);
			window.removeEventListener('dragend', onDragEnd);
		};
	});
</script>

{#if vanished.length > 0}
	<p class="vanished">
		<Info size={14} />
		{vanished.length} repo{vanished.length === 1 ? '' : 's'} no longer appear on GitHub. Their
		status is kept so it returns if the repo does.
		{#if !hasRepoScope}
			Private repos are hidden because this login lacks the <code>repo</code> scope, so
			<button class="link" onclick={() => login()}>reconnect</button> to see them.
		{/if}
	</p>
{/if}

{#if suggestDismissed.value}
	<button class="restore" onclick={showSuggestions} title="Show the suggestions banner again">
		Suggestions are hidden. Show?
	</button>
{:else}
	<SuggestedPanel />
{/if}

{#if filteredRepos().length === 0}
	<p class="none">No repos match the current filters.</p>
{/if}

<div class="cols" role="presentation" bind:this={colsEl} ondragover={onColsDragOver}>
	{#each columns as { status, repos } (status.id)}
		<BoardColumn {status} {repos} />
	{/each}
</div>

<style>
	.cols {
		flex: 1;
		display: flex;
		gap: 12px;
		overflow-x: auto;
		min-height: 0;
		padding-bottom: 8px;
	}
	.cols :global(.col) {
		flex: 1 1 0;
		min-width: 264px;
		max-width: 340px;
	}
	.vanished {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 12px;
		margin: 0 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-subtle);
		color: var(--text-dim);
		font-size: 12.5px;
	}
	.vanished code {
		font-size: 0.95em;
	}
	.vanished .link {
		padding: 0;
		border: none;
		background: transparent;
		color: var(--accent);
		font-size: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.restore {
		margin: 0 0 14px;
		padding: 2px 0;
		border: none;
		background: transparent;
		color: var(--text-dim);
		font-size: 12px;
	}
	.restore:hover:not(:disabled) {
		background: transparent;
		border: none;
		color: var(--accent);
		text-decoration: underline;
	}
	.none {
		margin: 24px 0;
		text-align: center;
		color: var(--text-dim);
	}
</style>
