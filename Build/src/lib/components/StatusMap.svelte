<script lang="ts">
	import { hierarchy, pack } from 'd3';
	import type { GroupBy, Repo, SizeBy } from '$lib/types';
	import {
		store,
		ui,
		filteredRepos,
		sortedStatuses,
		statusById,
		statusLabel
	} from '$lib/state.svelte';
	import { monthsSincePush } from '$lib/suggest';
	import { orgOf } from '$lib/format';

	let groupBy = $state<GroupBy>('language');
	let sizeBy = $state<SizeBy>('stars');

	let root: HTMLDivElement;
	let width = $state(800);
	let height = $state(500);

	interface PackDatum {
		name: string;
		value?: number;
		repo?: Repo;
		children?: PackDatum[];
	}

	interface MapNode {
		id: string;
		name: string;
		repo?: Repo;
		x: number;
		y: number;
		r: number;
		depth: number;
		color?: string;
		px: number;
		py: number;
	}

	let nodes = $state<MapNode[]>([]);

	function sizeOf(r: Repo): number {
		return sizeBy === 'stars' ? Math.sqrt(r.stargazerCount + 1) : 1 / (monthsSincePush(r) / 3 + 1);
	}

	function statusColor(r: Repo): string {
		const id = store.repos[String(r.databaseId)]?.status ?? 'todo';
		return statusById(id)?.color ?? '#888';
	}

	interface LeafDatum {
		name: string;
		value: number;
		repo: Repo;
	}

	function groupLeaves(group: (r: Repo) => string): PackDatum[] {
		const buckets = new Map<string, Repo[]>();
		for (const r of filteredRepos()) {
			const g = group(r);
			if (!buckets.has(g)) buckets.set(g, []);
			buckets.get(g)?.push(r);
		}
		return [...buckets.entries()]
			.map(([name, rs]) => ({
				name,
				children: rs.map((r): LeafDatum => ({ name: r.nameWithOwner, value: sizeOf(r), repo: r }))
			}))
			.sort((a, b) => b.children.length - a.children.length);
	}

	$effect(() => {
		const el = root;
		if (!el) return;
		const set = () => {
			width = el.clientWidth;
			height = Math.max(340, Math.round(el.clientWidth * 0.62));
		};
		set();
		const ro = new ResizeObserver(set);
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => {
		const w = width;
		const h = height;
		const list = filteredRepos();
		if (list.length === 0) {
			nodes = [];
			return;
		}
		const children: PackDatum[] =
			groupBy === 'none'
				? list.map((r) => ({ name: r.nameWithOwner, value: sizeOf(r), repo: r }))
				: groupBy === 'language'
					? groupLeaves((r) => r.primaryLanguage?.name ?? 'no language')
					: groupLeaves(orgOf);

		const packed = pack<PackDatum>()
			.size([w, h])
			.padding(4)(hierarchy<PackDatum>({ name: 'repos', children }).sum((d) => d.value ?? 0));

		const flat: MapNode[] = [];
		packed.each((d) => {
			const data = d.data;
			flat.push({
				id: `${d.depth}:${data.name}`,
				name: data.name,
				repo: data.repo,
				x: d.x,
				y: d.y,
				r: d.r,
				depth: d.depth,
				color: data.repo ? statusColor(data.repo) : undefined,
				px: d.parent?.x ?? d.x,
				py: d.parent?.y ?? d.y
			});
		});
		nodes = flat;
	});

	const leafNodes = $derived(nodes.filter((n) => n.repo));
	const groupNodes = $derived(nodes.filter((n) => !n.repo && n.depth > 0 && n.r >= 26));
	const labelFor = (n: MapNode) =>
		n.repo ? statusLabel(store.repos[String(n.repo.databaseId)]?.status ?? '') || 'unassigned' : '';
</script>

<div class="wrap">
	<div class="controls">
		<span class="ctl">
			<span class="k">group by</span>
			<span class="seg">
				<button class:on={groupBy === 'language'} onclick={() => (groupBy = 'language')}>language</button>
				<button class:on={groupBy === 'org'} onclick={() => (groupBy = 'org')}>org</button>
				<button class:on={groupBy === 'none'} onclick={() => (groupBy = 'none')}>none</button>
			</span>
		</span>
		<span class="ctl">
			<span class="k">size by</span>
			<span class="seg">
				<button class:on={sizeBy === 'stars'} onclick={() => (sizeBy = 'stars')}>stars</button>
				<button class:on={sizeBy === 'recency'} onclick={() => (sizeBy = 'recency')}>recency</button>
			</span>
		</span>
		<span class="legend">
			{#each sortedStatuses() as s (s.id)}
				<span class="leg"><i style={`background: ${s.color}`}></i>{s.label}</span>
			{/each}
		</span>
	</div>

	<div class="map" bind:this={root}>
		{#if leafNodes.length === 0}
			<p class="none">No repos to map.</p>
		{:else}
			<svg
				class="canvas"
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label="Repository status map"
			>
				{#each nodes as n (n.id)}
					{#if n.repo}
						<line class="link" x1={n.x} y1={n.y} x2={n.px} y2={n.py} stroke={n.color} />
					{/if}
				{/each}
				{#each groupNodes as n (n.id)}
					<circle class="group" cx={n.x} cy={n.y} r={n.r} />
				{/each}
				{#each leafNodes as n (n.id)}
					<g
						class="bubble"
						role="button"
						tabindex="0"
						onclick={() => n.repo && (ui.selectedRepo = n.repo)}
						onkeydown={(e) => e.key === 'Enter' && n.repo && (ui.selectedRepo = n.repo)}
					>
						<circle
							cx={n.x}
							cy={n.y}
							r={Math.max(n.r, 3)}
							fill={n.color}
							fill-opacity="0.82"
							stroke={n.color}
						>
							<title>{n.name} · {labelFor(n)}</title>
						</circle>
					</g>
				{/each}
				{#each groupNodes as n (n.id)}
					<text class="label" x={n.x} y={n.y}>{n.name}</text>
				{/each}
			</svg>
		{/if}
	</div>
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 16px;
		padding: 10px 14px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.ctl {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.k {
		color: var(--text-dim);
		font-size: 12px;
	}
	.seg {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.ctl button {
		padding: 4px 10px;
		font-size: 12px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: transparent;
		color: var(--text-dim);
	}
	.ctl button:hover:not(:disabled) {
		background: transparent;
		border-color: transparent;
		color: var(--text);
	}
	.ctl button.on {
		background: var(--panel);
		border-color: var(--border);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	.legend {
		margin-left: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.leg {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.leg i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.map {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 6px;
	}
	.canvas {
		display: block;
		overflow: visible;
	}
	.link {
		stroke-opacity: 0.28;
		stroke-width: 1;
	}
	.group {
		fill: none;
		stroke: var(--text-dim);
		stroke-opacity: 0.1;
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}
	.bubble {
		cursor: pointer;
		outline: none;
	}
	.bubble:focus circle {
		stroke-width: 3;
		stroke-dasharray: 2 2;
	}
	.label {
		fill: var(--text-dim);
		opacity: 0.65;
		font-size: 11px;
		text-anchor: middle;
		dominant-baseline: middle;
		pointer-events: none;
		user-select: none;
	}
	.none {
		margin: 0;
		padding: 40px 0;
		text-align: center;
		color: var(--text-dim);
	}
</style>
