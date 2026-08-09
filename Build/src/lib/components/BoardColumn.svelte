<script lang="ts">
	import { onMount } from 'svelte';
	import type { Repo, Status } from '$lib/types';
	import { moveRepo } from '$lib/state.svelte';
	import { drag } from '$lib/boardDrag.svelte';
	import RepoCard from './RepoCard.svelte';

	let { status, repos }: { status: Status; repos: Repo[] } = $props();

	let dragOver = $state(false);
	let root: HTMLDivElement;
	let listEl: HTMLDivElement;

	// Vertical auto-scroll: dragging near the top/bottom of a tall column scrolls
	// its card list so the card can reach off-screen positions within the column.
	let vSpeed = 0;
	let vRaf = 0;

	function vStep(): void {
		if (vSpeed === 0 || !listEl) {
			vRaf = 0;
			return;
		}
		listEl.scrollTop += vSpeed * 14;
		vRaf = requestAnimationFrame(vStep);
	}

	function onListDragOver(e: DragEvent): void {
		e.preventDefault();
		const el = listEl;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const edge = 60;
		if (e.clientY < r.top + edge) vSpeed = -1;
		else if (e.clientY > r.bottom - edge) vSpeed = 1;
		else vSpeed = 0;
		if (vSpeed !== 0 && vRaf === 0) vRaf = requestAnimationFrame(vStep);
	}

	/** Insertion index derived from the pointer's Y over the column's cards. */
	function dropIndex(clientY: number): number {
		const cards = root.querySelectorAll<HTMLElement>('[data-card-id]');
		for (let i = 0; i < cards.length; i++) {
			const r = cards[i].getBoundingClientRect();
			if (clientY < r.bottom) return clientY < r.top + r.height / 2 ? i : i + 1;
		}
		return cards.length;
	}

	function handleDrop(e: DragEvent): void {
		e.preventDefault();
		dragOver = false;
		vSpeed = 0;
		const id = e.dataTransfer?.getData('text/plain');
		if (!id) return;
		moveRepo(id, status.id, dropIndex(e.clientY));
	}

	function releaseAutoScroll(): void {
		vSpeed = 0;
		dragOver = false;
	}

	onMount(() => {
		window.addEventListener('dragend', releaseAutoScroll);
		window.addEventListener('drop', releaseAutoScroll);
		return () => {
			window.removeEventListener('dragend', releaseAutoScroll);
			window.removeEventListener('drop', releaseAutoScroll);
		};
	});
</script>

<div
	bind:this={root}
	class="col"
	class:dragover={dragOver}
	class:touch-target={drag.repoId !== null && drag.overStatus === status.id}
	data-status={status.id}
	role="region"
	aria-label={`${status.label} column drop zone`}
	ondragover={(e) => {
		e.preventDefault();
		dragOver = true;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}}
	ondragleave={() => (dragOver = false)}
	ondrop={handleDrop}
>
	<header class="head">
		<span class="dot" style={`background: ${status.color}`}></span>
		<h3>{status.label}</h3>
		<span class="count">{repos.length}</span>
	</header>
	<div
		class="list"
		role="presentation"
		bind:this={listEl}
		ondragover={onListDragOver}
		ondragleave={() => (vSpeed = 0)}
	>
		{#each repos as repo, i (repo.databaseId)}
			{#if drag.overStatus === status.id && drag.overIndex === i}
				<div class="insert" aria-hidden="true"></div>
			{/if}
			<RepoCard {repo} />
			{#if drag.overStatus === status.id && drag.overIndex === i + 1}
				<div class="insert" aria-hidden="true"></div>
			{/if}
		{/each}
		{#if repos.length === 0}
			<p class="empty">nothing here</p>
		{/if}
	</div>
</div>

<style>
	.col {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		border-radius: var(--radius);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		transition: border-color 0.1s;
	}
	.col.dragover {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.col.touch-target {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--border-muted);
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.head h3 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.count {
		margin-left: auto;
		padding: 0 7px;
		line-height: 18px;
		color: var(--text-dim);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	.list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		overflow-y: auto;
	}
	.empty {
		margin: auto;
		color: var(--text-dim);
		font-size: 12px;
	}
	.insert {
		flex: none;
		height: 2px;
		margin: -3px 0;
		border-radius: 2px;
		background: var(--accent);
	}
</style>
