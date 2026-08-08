<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';

	export interface MultiOption {
		value: string;
		label: string;
	}

	let {
		label,
		options,
		include = $bindable([] as string[]),
		exclude = $bindable([] as string[])
	}: {
		label: string;
		options: MultiOption[];
		include?: string[];
		exclude?: string[];
	} = $props();

	let open = $state(false);
	let popEl = $state<HTMLDivElement>();

	const byValue = $derived(new Map(options.map((o) => [o.value, o.label])));

	const activeCount = $derived(include.length + exclude.length);
	const activeLabel = $derived(
		[...include, ...exclude.map((v) => `not:${v}`)]
			.slice(0, 2)
			.map((k) => {
				const v = k.startsWith('not:') ? k.slice(4) : k;
				const text = byValue.get(v) ?? v;
				return k.startsWith('not:') ? `¬${text}` : text;
			})
			.join(', ')
	);

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		const onClick = (e: MouseEvent) => {
			if (popEl && !popEl.contains(e.target as Node)) open = false;
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('mousedown', onClick);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('mousedown', onClick);
		};
	});

	function setInclude(v: string, on: boolean): void {
		if (on) {
			include = [...include.filter((x) => x !== v), v];
			exclude = exclude.filter((x) => x !== v);
		} else {
			include = include.filter((x) => x !== v);
		}
	}

	function setExclude(v: string, on: boolean): void {
		if (on) {
			exclude = [...exclude.filter((x) => x !== v), v];
			include = include.filter((x) => x !== v);
		} else {
			exclude = exclude.filter((x) => x !== v);
		}
	}

	function clear(): void {
		include = [];
		exclude = [];
	}
</script>

<div class="ms" bind:this={popEl}>
	<button
		class="trigger"
		class:on={activeCount > 0}
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span class="t-label">{label}</span>
		{#if activeCount === 0}
			<span class="t-none">all</span>
		{:else}
			<span class="t-active" title={activeLabel}>{activeCount} selected</span>
			{#if include.length > 0 && exclude.length > 0}
				<span class="t-mode">in {include.length} / out {exclude.length}</span>
			{:else if include.length === 0}
				<span class="t-mode">excluding</span>
			{/if}
		{/if}
		<span class="caret"><ChevronDown size={13} /></span>
	</button>

	{#if open}
		<div class="pop" role="listbox" aria-label={label}>
			<div class="hdr">
				<span class="hdr-label">{label}</span>
				<button class="hdr-clear" onclick={clear} disabled={activeCount === 0}>clear</button>
			</div>
			<div class="cols">
				<span class="col-h">in</span>
				<span class="col-h">out</span>
			</div>
			<div class="list">
				{#each options as o (o.value)}
					<label class="opt">
						<input
							type="checkbox"
							checked={include.includes(o.value)}
							onchange={(e) => setInclude(o.value, e.currentTarget.checked)}
						/>
						<input
							type="checkbox"
							checked={exclude.includes(o.value)}
							onchange={(e) => setExclude(o.value, e.currentTarget.checked)}
						/>
						<span class="name" class:off={exclude.includes(o.value)}>{o.label}</span>
					</label>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.ms {
		position: relative;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		font-size: 12.5px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-dim);
		white-space: nowrap;
	}
	.trigger:hover:not(:disabled),
	.trigger.on {
		color: var(--text);
	}
	.t-label {
		font-weight: 500;
	}
	.t-none {
		color: var(--text-dim);
	}
	.t-active {
		padding: 0 6px;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font-variant-numeric: tabular-nums;
	}
	.t-mode {
		font-size: 11px;
		color: var(--danger);
	}
	.caret {
		flex: none;
		display: inline-flex;
		opacity: 0.6;
	}
	.pop {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 50;
		width: 260px;
		max-height: 320px;
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
	.hdr {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
	}
	.hdr-label {
		font-size: 12.5px;
		font-weight: 600;
	}
	.hdr-clear {
		font-size: 11.5px;
		color: var(--text-dim);
		padding: 2px 6px;
	}
	.hdr-clear:hover:not(:disabled) {
		color: var(--danger);
	}
	.cols {
		display: grid;
		grid-template-columns: 24px 24px 1fr;
		padding: 4px 12px 0;
	}
	.col-h {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
	}
	.list {
		overflow-y: auto;
		padding: 4px 12px 10px;
	}
	.opt {
		display: grid;
		grid-template-columns: 24px 24px 1fr;
		align-items: center;
		gap: 0;
		padding: 3px 0;
		cursor: pointer;
	}
	.opt input {
		margin: 0;
		width: 14px;
		height: 14px;
		cursor: pointer;
	}
	.name {
		font-size: 12.5px;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name.off {
		color: var(--text-dim);
		text-decoration: line-through;
	}
</style>
