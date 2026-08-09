<script lang="ts">
	import {
		filters,
		languageOptions,
		orgOptions,
		filteredRepos,
		repos,
		ui,
		FILTERS_KEY
	} from '$lib/state.svelte';
	import type { GroupBy, SizeBy } from '$lib/types';
	import { mapOptions } from '$lib/mapOptions.svelte';
	import { Search, SlidersHorizontal, ChevronDown, X } from 'lucide-svelte';
	import MultiSelect from './MultiSelect.svelte';

	// Persist filter/exclude selections (search, language/org includes and
	// excludes, hide flags) so they survive a reload. Runs on the client only.
	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
	});

	const languages = $derived(
		languageOptions().map((l) => ({ value: l, label: l === 'none' ? 'no language' : l }))
	);
	const orgs = $derived(orgOptions().map((o) => ({ value: o, label: o })));
	const count = $derived(filteredRepos().length);
	const total = $derived(repos.length);

	const activeCount = $derived(
		filters.includedLanguages.length +
			filters.excludedLanguages.length +
			filters.includedOrgs.length +
			filters.excludedOrgs.length +
			(filters.hideForks ? 1 : 0) +
			(filters.hideArchived ? 1 : 0)
	);

	let open = $state(false);
	let barEl = $state<HTMLDivElement>();

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		const onClick = (e: PointerEvent) => {
			if (barEl && !barEl.contains(e.target as Node)) open = false;
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onClick);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onClick);
		};
	});

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

<div class="filterbar" bind:this={barEl}>
	<div class="search-wrap">
		<span class="search-icon"><Search size={15} /></span>
		<input class="search" type="search" placeholder="Search repos…" bind:value={filters.query} />
	</div>
	<button
		class="filters"
		class:on={activeCount > 0}
		aria-haspopup="true"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<SlidersHorizontal size={14} />
		Filters
		{#if activeCount > 0}
			<span class="badge">{activeCount}</span>
		{/if}
		<span class="caret" class:flip={open}><ChevronDown size={13} /></span>
	</button>

	{#if open}
		<div class="panel" role="group" aria-label="Filters">
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
			<div class="row">
				<label class="toggle"
					><input type="checkbox" bind:checked={filters.hideForks} /> hide forks</label
				>
				<label class="toggle"
					><input type="checkbox" bind:checked={filters.hideArchived} /> hide archived</label
				>
			</div>
			{#if ui.view === 'map'}
				<div class="map-opts">
					<label class="opt">
						<span class="k">group by</span>
						<select
							value={mapOptions.groupBy}
							onchange={(e) => (mapOptions.groupBy = e.currentTarget.value as GroupBy)}
							aria-label="Group repos by"
						>
							<option value="language">language</option>
							<option value="org">org</option>
							<option value="none">none</option>
						</select>
					</label>
					<label class="opt">
						<span class="k">size by</span>
						<select
							value={mapOptions.sizeBy}
							onchange={(e) => (mapOptions.sizeBy = e.currentTarget.value as SizeBy)}
							aria-label="Size repos by"
						>
							<option value="stars">stars</option>
							<option value="recency">recency</option>
						</select>
					</label>
				</div>
			{/if}
			<div class="foot">
				<span class="count">{count} / {total}</span>
				<button
					class="clear"
					onclick={clear}
					title="Clear all filters"
					aria-label="Clear all filters"
				>
					<X size={15} />
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.filterbar {
		position: relative;
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
	.filters {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		font-size: 12.5px;
		color: var(--text-dim);
		white-space: nowrap;
	}
	.filters:hover:not(:disabled) {
		color: var(--text);
	}
	.filters.on {
		color: var(--text);
	}
	.badge {
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--on-accent);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.caret {
		display: inline-flex;
		transition: transform 0.15s ease;
	}
	.caret.flip {
		transform: rotate(180deg);
	}
	.panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 55;
		width: min(340px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
		animation: pop 0.12s ease-out;
	}
	.panel :global(.ms) {
		width: 100%;
	}
	.panel :global(.trigger) {
		width: 100%;
		justify-content: space-between;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.map-opts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--border-muted);
	}
	.opt {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.opt .k {
		color: var(--text-dim);
		font-size: 11px;
		font-weight: 500;
	}
	.opt select {
		width: 100%;
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
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 10px;
		border-top: 1px solid var(--border-muted);
	}
	.count {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
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
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	@media (max-width: 767px) {
		.filterbar {
			flex-direction: column;
			align-items: stretch;
		}
		.search-wrap {
			flex: 1 1 auto;
		}
		.filters {
			justify-content: space-between;
			padding: 9px 12px;
		}
		.panel {
			left: 0;
			right: 0;
			width: auto;
		}
		.row {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		}
		.toggle {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 9px 12px;
			border: 1px solid var(--border);
			border-radius: var(--radius);
			background: var(--panel);
		}
	}
</style>
