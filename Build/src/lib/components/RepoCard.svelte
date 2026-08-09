<script lang="ts">
	import type { Repo } from '$lib/types';
	import { store, ui, statusLabel, suggestedFor } from '$lib/state.svelte';
	import { longPressDrag, drag } from '$lib/boardDrag.svelte';
	import { formatStars, timeAgo, orgOf } from '$lib/format';
	import { Star, Lock, GitFork, Archive, Sparkles, FileText } from 'lucide-svelte';

	let { repo }: { repo: Repo } = $props();

	const key = $derived(String(repo.databaseId));
	const rs = $derived(store.repos[key]);
	const suggested = $derived(suggestedFor(repo));
	const needsSuggestion = $derived(!!rs && rs.status !== suggested);
	const hasNote = $derived(!!rs?.note);

	let dragging = $state(false);
</script>

<div
	class="card"
	class:dragging
	class:origin={drag.repoId === key}
	class:needs={needsSuggestion}
	draggable="true"
	data-card-id={repo.databaseId}
	tabindex="0"
	role="button"
	aria-label={repo.nameWithOwner}
	use:longPressDrag
	ondragstart={(e) => {
		dragging = true;
		e.dataTransfer?.setData('text/plain', String(repo.databaseId));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}}
	ondragend={() => (dragging = false)}
	onclick={() => (ui.selectedRepo = repo)}
	onkeydown={(e) => {
		if (e.key === 'Enter') ui.selectedRepo = repo;
	}}
>
	<header class="head">
		<a
			class="name"
			href={repo.url}
			target="_blank"
			rel="noreferrer"
			title={repo.nameWithOwner}
			onclick={(e) => e.stopPropagation()}
			>{repo.name}</a
		>
		<span class="owner">{orgOf(repo)}</span>
	</header>
	{#if repo.description}
		<p class="desc">{repo.description}</p>
	{/if}
	<footer class="meta">
		{#if repo.primaryLanguage}
			<span title={repo.primaryLanguage.name}>
				<i class="lang" style={`background: ${repo.primaryLanguage.color}`}></i>
				{repo.primaryLanguage.name}
			</span>
		{/if}
		{#if repo.stargazerCount > 0}
			<span title="stars"><Star size={11} fill="currentColor" /> {formatStars(repo.stargazerCount)}</span>
		{/if}
		<span title="last push">Updated {timeAgo(repo.pushedAt)}</span>
		{#if repo.isPrivate}
			<span title="private"><Lock size={11} /></span>
		{/if}
		{#if repo.isFork}
			<span title="fork"><GitFork size={11} /></span>
		{/if}
		{#if repo.isArchived}
			<span title="archived"><Archive size={11} /></span>
		{/if}
		{#if hasNote}
			<span title="has a note"><FileText size={11} /></span>
		{/if}
		{#if needsSuggestion}
			<span class="suggest" title={`suggested: ${statusLabel(suggested)}`}>
				<Sparkles size={11} /> Suggested
			</span>
		{/if}
	</footer>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-sm);
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		touch-action: manipulation;
	}
	.card:hover {
		border-color: var(--border-strong);
	}
	.card:active {
		cursor: grabbing;
	}
	.card.dragging {
		opacity: 0.45;
		box-shadow: var(--shadow-md);
	}
	.card.origin {
		opacity: 0.4;
	}
	.card.needs {
		border-color: var(--accent);
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}
	.name {
		color: var(--text);
		font-weight: 600;
		font-size: 13.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.owner {
		margin-left: auto;
		flex: none;
		color: var(--text-dim);
		font-size: 11.5px;
	}
	.desc {
		margin: 0;
		color: var(--text-dim);
		font-size: 12px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		line-clamp: 2;
		overflow: hidden;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		color: var(--text-dim);
		font-size: 11.5px;
	}
	.meta span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}
	.meta .suggest {
		color: var(--accent);
		font-weight: 500;
	}
	.lang {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	@media (max-width: 767px) {
		.card {
			padding: 12px 14px;
		}
	}
</style>
