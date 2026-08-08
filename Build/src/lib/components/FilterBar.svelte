<script lang="ts">
	import { filters, languageOptions, orgOptions, filteredRepos, repos } from '$lib/state.svelte';
	import { Search, X } from 'lucide-svelte';
	import MultiSelect from './MultiSelect.svelte';

	const languages = $derived(
		languageOptions().map((l) => ({ value: l, label: l === 'none' ? 'no language' : l }))
	);
	const orgs = $derived(orgOptions().map((o) => ({ value: o, label: o })));
	const count = $derived(filteredRepos().length);
	const total = $derived(repos.length);

	function clear(): void {
		filters.query = '';
		filters.includedLanguages = [];
		filters.excludedLanguages = [];
		filters.includedOrgs = [];
		filters.excludedOrgs = [];
		filters.hideForks = false;
		filters.hideArchived = false;
	}
</script>

<div class="filterbar">
	<div class="search-wrap">
		<span class="search-icon"><Search size={15} /></span>
		<input class="search" type="search" placeholder="Search repos…" bind:value={filters.query} />
	</div>
	<MultiSelect
		label="Languages"
		options={languages}
		bind:include={filters.includedLanguages}
		bind:exclude={filters.excludedLanguages}
	/>
	<MultiSelect
		label="Owners"
		options={orgs}
		bind:include={filters.includedOrgs}
		bind:exclude={filters.excludedOrgs}
	/>
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
