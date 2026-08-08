<script lang="ts">
	import { filters, languageOptions, orgOptions, filteredRepos, repos } from '$lib/state.svelte';
	import { Search, X } from 'lucide-svelte';

	const languages = $derived(languageOptions());
	const orgs = $derived(orgOptions());
	const count = $derived(filteredRepos().length);
	const total = $derived(repos.length);

	function clear(): void {
		filters.query = '';
		filters.language = 'all';
		filters.org = 'all';
		filters.hideForks = false;
		filters.hideArchived = false;
	}
</script>

<div class="filterbar">
	<div class="search-wrap">
		<span class="search-icon"><Search size={15} /></span>
		<input class="search" type="search" placeholder="Search repos…" bind:value={filters.query} />
	</div>
	<select bind:value={filters.language} aria-label="Filter by language">
		<option value="all">All languages</option>
		{#each languages as l (l)}
			<option value={l}>{l}</option>
		{/each}
	</select>
	<select bind:value={filters.org} aria-label="Filter by owner">
		<option value="all">All owners</option>
		{#each orgs as o (o)}
			<option value={o}>{o}</option>
		{/each}
	</select>
	<label class="toggle"><input type="checkbox" bind:checked={filters.hideForks} /> hide forks</label>
	<label class="toggle"><input type="checkbox" bind:checked={filters.hideArchived} /> hide archived</label>
	<span class="count">{count} / {total}</span>
	<button class="clear" onclick={clear} title="Clear all filters" aria-label="Clear all filters">
		<X size={15} />
	</button>
</div>

<style>
	.filterbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 14px;
	}
	.search-wrap {
		position: relative;
		flex: 1 1 240px;
		display: flex;
		align-items: center;
	}
	.search-icon {
		position: absolute;
		left: 10px;
		display: inline-flex;
		pointer-events: none;
		color: var(--text-dim);
	}
	.search {
		flex: 1;
		padding-left: 32px;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
		font-size: 12.5px;
		white-space: nowrap;
		cursor: pointer;
	}
	.toggle input {
		margin: 0;
	}
	.count {
		margin-left: auto;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		color: var(--text-dim);
	}
</style>
