<script lang="ts">
	import type { Repo } from '$lib/types';
	import {
		store,
		assignStatus,
		addTag,
		toggleTag,
		setNote,
		sortedStatuses,
		suggestedFor,
		statusLabel
	} from '$lib/state.svelte';
	import { formatStars, timeAgo, orgOf } from '$lib/format';
	import { ExternalLink, Star, Lock, GitFork, Archive, Plus } from 'lucide-svelte';

	let { repo }: { repo: Repo } = $props();

	const key = $derived(String(repo.databaseId));
	const rs = $derived(store.repos[key]);
	const suggested = $derived(suggestedFor(repo));
	const differs = $derived(!!rs && rs.status !== suggested);
	const repoUrl = $derived(repo.url);

	let newTag = $state('');

	function submitTag(): void {
		if (!newTag.trim()) return;
		addTag(key, newTag);
		newTag = '';
	}
</script>

<div class="detail">
	<header class="top">
		<div>
			<h3 class="name">{repo.nameWithOwner}</h3>
			<p class="desc">{repo.description ?? 'No description.'}</p>
		</div>
		<a class="open" href={repoUrl} target="_blank" rel="noreferrer">
			<ExternalLink size={13} /> Open on GitHub
		</a>
	</header>

	<div class="meta">
		{#if repo.primaryLanguage}
			<span class="chip"><i class="lang" style={`background: ${repo.primaryLanguage.color}`}></i>{repo.primaryLanguage.name}</span>
		{/if}
		{#if repo.isPrivate}<span class="chip warn"><Lock size={11} /> private</span>{/if}
		{#if repo.isFork}<span class="chip"><GitFork size={11} /> fork</span>{/if}
		{#if repo.isArchived}<span class="chip"><Archive size={11} /> archived</span>{/if}
		{#if repo.stargazerCount > 0}<span class="chip"><Star size={11} fill="currentColor" /> {formatStars(repo.stargazerCount)}</span>{/if}
		<span class="chip" title="last push">{timeAgo(repo.pushedAt)}</span>
		{#if repo.parent}
			<a class="chip" href={repo.parent.url} target="_blank" rel="noreferrer">parent: {repo.parent.nameWithOwner}</a>
		{/if}
	</div>

	<section class="group">
		<h4>Status</h4>
		{#if differs}
			<p class="hint">
				Suggestion says <strong>{statusLabel(suggested)}</strong>, click a chip to apply it.
			</p>
		{/if}
		<div class="status-row">
			{#each sortedStatuses() as s (s.id)}
				<button
					class="status-chip"
					class:active={rs?.status === s.id}
					style={`--c: ${s.color}`}
					onclick={() => assignStatus(key, s.id)}
				>
					<span class="dot" style={`background: ${s.color}`}></span>
					{s.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="group">
		<h4>Tags</h4>
		{#if rs && rs.tags.length > 0}
			<div class="tags">
				{#each rs.tags as tag (tag)}
					<button class="tag" onclick={() => toggleTag(key, tag)} title="remove tag">
						{tag} ×
					</button>
				{/each}
			</div>
		{/if}
		<form class="tag-add" onsubmit={(e) => {
			e.preventDefault();
			submitTag();
		}}>
			<input type="text" placeholder="Add a tag…" bind:value={newTag} />
			<button type="submit">
				<Plus size={14} /> Add
			</button>
		</form>
	</section>

	<section class="group">
		<h4>Note</h4>
		<textarea
			rows="3"
			placeholder="Why is this here? What's next?"
			value={rs?.note ?? ''}
			oninput={(e) => setNote(key, e.currentTarget.value)}
		></textarea>
	</section>
</div>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.top {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}
	.name {
		margin: 0 0 4px;
		font-size: 20px;
		font-weight: 600;
	}
	.desc {
		margin: 0;
		color: var(--text-dim);
	}
	.open {
		flex: none;
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 16px;
		font-size: 12.5px;
		color: var(--text-dim);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.chip.warn {
		color: var(--text-dim);
	}
	.lang {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.group h4 {
		margin: 0 0 10px;
		font-size: 12px;
		font-weight: 600;
	}
	.hint {
		margin: -2px 0 10px;
		color: var(--text-dim);
		font-size: 12.5px;
	}
	.status-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		font-size: 12.5px;
	}
	.status-chip.active {
		border-color: var(--c);
		color: var(--c);
		box-shadow: 0 0 0 1px var(--c) inset;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.tag {
		padding: 3px 10px;
		font-size: 12px;
		border-radius: var(--radius);
		color: var(--accent);
	}
	.tag-add {
		display: flex;
		gap: 8px;
	}
	.tag-add button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.tag-add input {
		flex: 1;
	}
	textarea {
		width: 100%;
		resize: vertical;
	}
	@media (max-width: 767px) {
		.top {
			flex-direction: column;
			gap: 12px;
		}
		.name {
			font-size: 18px;
			overflow-wrap: anywhere;
		}
		.open {
			width: 100%;
			justify-content: center;
			padding: 10px 16px;
			border: 1px solid var(--border);
			border-radius: var(--radius);
			text-decoration: none;
		}
		.status-chip {
			padding: 9px 14px;
			font-size: 13px;
		}
		.tag {
			padding: 6px 12px;
			font-size: 12.5px;
		}
		.tag-add button {
			padding: 10px 16px;
		}
		textarea {
			min-height: 96px;
		}
	}
</style>
