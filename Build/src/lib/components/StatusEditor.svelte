<script lang="ts">
	import {
		sortedStatuses,
		store,
		addStatus,
		updateStatus,
		removeStatus,
		moveStatus,
		moveStatusTo,
		resetStatuses
	} from '$lib/state.svelte';
	import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical } from 'lucide-svelte';

	let newLabel = $state('');
	let newColor = $state('#6a9fff');

	let dragId = $state<string | null>(null);
	let dropIdx = $state<number | null>(null);
	let listEl: HTMLDivElement;

	const countFor = (id: string) =>
		Object.values(store.repos).filter((r) => r.status === id).length;

	function submit(): void {
		const label = newLabel.trim();
		if (!label) return;
		addStatus(label, newColor);
		newLabel = '';
	}

	function onListDragOver(e: DragEvent): void {
		e.preventDefault();
		if (!dragId || !listEl) return;
		const rows = listEl.querySelectorAll<HTMLElement>('[data-idx]');
		let target = rows.length;
		for (let i = 0; i < rows.length; i++) {
			const r = rows[i].getBoundingClientRect();
			if (e.clientY < r.top + r.height / 2) {
				target = i;
				break;
			}
		}
		dropIdx = target;
	}

	function onDrop(e: DragEvent): void {
		e.preventDefault();
		const id = e.dataTransfer?.getData('text/plain') ?? dragId;
		if (id && dropIdx !== null) moveStatusTo(id, dropIdx);
		dragId = null;
		dropIdx = null;
	}
</script>

<div class="editor">
	<div
		class="list"
		role="list"
		bind:this={listEl}
		ondragover={onListDragOver}
		ondragleave={() => (dropIdx = null)}
		ondrop={onDrop}
	>
		{#each sortedStatuses() as s, i (s.id)}
			<div
				class="row"
				role="listitem"
				class:dragging={dragId === s.id}
				class:drop-before={dragId && dragId !== s.id && dropIdx === i}
				class:drop-after={dragId && dragId !== s.id && dropIdx === i + 1}
				data-idx={i}
			>
				<button
					class="grip"
					draggable="true"
					title="Drag to reorder"
					aria-label={`Reorder ${s.label}`}
					ondragstart={(e) => {
						dragId = s.id;
						e.dataTransfer?.setData('text/plain', s.id);
						if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
					}}
					ondragend={() => {
						dragId = null;
						dropIdx = null;
					}}
				>
					<GripVertical size={15} />
				</button>
				<div class="order">
					<button
						class="move"
						onclick={() => moveStatus(s.id, -1)}
						disabled={i === 0}
						aria-label="move up"
						title="Move up"
					>
						<ChevronUp size={13} />
					</button>
					<button
						class="move"
						onclick={() => moveStatus(s.id, 1)}
						disabled={i === sortedStatuses().length - 1}
						aria-label="move down"
						title="Move down"
					>
						<ChevronDown size={13} />
					</button>
				</div>
				<input
					type="color"
					value={s.color}
					oninput={(e) => updateStatus(s.id, { color: e.currentTarget.value })}
					aria-label={`color for ${s.label}`}
				/>
				<input
					class="label"
					type="text"
					value={s.label}
					oninput={(e) => updateStatus(s.id, { label: e.currentTarget.value })}
					aria-label="status label"
				/>
				<code class="id">{s.id}</code>
				<span class="count">{countFor(s.id)}</span>
				<button
					class="remove"
					onclick={() => removeStatus(s.id)}
					disabled={sortedStatuses().length <= 1}
					aria-label="remove status"
					title="reassigns repos to the first status"
				>
					<Trash2 size={14} />
				</button>
			</div>
		{/each}
	</div>

	<form class="add" onsubmit={(e) => {
		e.preventDefault();
		submit();
	}}>
		<input type="text" placeholder="New status label" bind:value={newLabel} />
		<input type="color" bind:value={newColor} aria-label="new status color" />
		<button type="submit">
			<Plus size={14} /> Add
		</button>
	</form>

	<button class="reset" onclick={resetStatuses}>Reset to defaults</button>
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
	}
	.row.dragging {
		opacity: 0.4;
	}
	.row.drop-before {
		box-shadow: 0 -2px 0 0 var(--accent);
	}
	.row.drop-after {
		box-shadow: 0 2px 0 0 var(--accent);
	}
	.grip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 28px;
		padding: 0;
		color: var(--text-dim);
		cursor: grab;
		touch-action: none;
	}
	.grip:active {
		cursor: grabbing;
	}
	.order {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.move {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 22px;
		padding: 0;
		line-height: 1;
		color: var(--text-dim);
	}
	.label {
		flex: 1;
		min-width: 120px;
	}
	.id {
		color: var(--text-dim);
		font-size: 11px;
	}
	.count {
		min-width: 2ch;
		text-align: right;
		color: var(--text-dim);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		color: var(--text-dim);
	}
	.remove:hover:not(:disabled) {
		color: var(--danger);
		border-color: var(--danger);
	}
	.add {
		display: flex;
		gap: 8px;
	}
	.add button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.add input[type='text'] {
		flex: 1;
	}
	.reset {
		align-self: flex-start;
		color: var(--text-dim);
	}
</style>
