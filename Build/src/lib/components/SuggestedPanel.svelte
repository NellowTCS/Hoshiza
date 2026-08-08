<script lang="ts">
	import {
		suggestedRepos,
		applyAllSuggestions,
		statusById,
		statusLabel,
		suggestedFor,
		ui
	} from '$lib/state.svelte';
	import { suggestDismissed, dismissSuggestions } from '$lib/suggestDismiss.svelte';
	import { Sparkles, Check, X } from 'lucide-svelte';

	const items = $derived(suggestedRepos());
</script>

{#if !suggestDismissed.value && items.length > 0}
	<section class="suggested">
		<header class="head">
			<Sparkles size={14} color="var(--accent)" />
			<h2>Suggested</h2>
			<span class="hint">from last-push activity</span>
			<button class="primary apply-all" onclick={applyAllSuggestions}>
				<Check size={12} /> Apply all
			</button>
			<button
				class="dismiss"
				onclick={dismissSuggestions}
				title="Hide suggestions"
				aria-label="Hide suggestions"
			>
				<X size={14} />
			</button>
		</header>
		<div class="row">
			{#each items as repo (repo.databaseId)}
				<button
					class="item"
					title={`suggested: ${statusLabel(suggestedFor(repo))}`}
					onclick={() => (ui.selectedRepo = repo)}
				>
					<span class="dot" style={`background: ${statusById(suggestedFor(repo))?.color ?? '#555'}`}></span>
					<span class="name">{repo.name}</span>
				</button>
			{/each}
		</div>
	</section>
{/if}

<style>
	.suggested {
		margin-bottom: 14px;
		padding: 10px 12px;
		background: var(--accent-bg);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.head h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.hint {
		color: var(--text-dim);
		font-size: 11.5px;
	}
	.apply-all {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 10px;
		font-size: 11.5px;
	}
	.dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-dim);
		border-radius: var(--radius);
	}
	.dismiss:hover:not(:disabled) {
		background: var(--btn-bg-hover);
		border-color: var(--border);
		color: var(--text);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: var(--radius);
		font-size: 12px;
		color: var(--text);
		background: var(--panel);
	}
	.item:hover:not(:disabled) {
		background: var(--panel);
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
</style>
