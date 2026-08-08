<script lang="ts">
	import { sortedStatuses, filteredRepos, store, vanishedIds } from '$lib/state.svelte';
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
</script>

{#if vanished.length > 0}
	<p class="vanished">
		<Info size={14} />
		{vanished.length} repo{vanished.length === 1 ? '' : 's'} no longer appear on GitHub. Their
		status is kept so it returns if the repo does.
	</p>
{/if}

<SuggestedPanel />

{#if filteredRepos().length === 0}
	<p class="none">No repos match the current filters.</p>
{/if}

<div class="cols">
	{#each columns as { status, repos } (status.id)}
		<BoardColumn {status} {repos} />
	{/each}
</div>

<style>
	.cols {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		padding-bottom: 8px;
	}
	.cols :global(.col) {
		flex: 1 0 264px;
		max-width: 320px;
		min-height: 56vh;
		max-height: 78vh;
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
	.none {
		margin: 24px 0;
		text-align: center;
		color: var(--text-dim);
	}
</style>
