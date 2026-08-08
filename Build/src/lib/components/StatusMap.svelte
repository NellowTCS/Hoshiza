<script lang="ts">
	import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide } from 'd3';
	import type { GroupBy, Repo, SizeBy } from '$lib/types';
	import {
		store,
		ui,
		filteredRepos,
		sortedStatuses,
		statusById
	} from '$lib/state.svelte';
	import { monthsSincePush } from '$lib/suggest';
	import { orgOf } from '$lib/format';

	let groupBy = $state<GroupBy>('language');
	let sizeBy = $state<SizeBy>('stars');

	let root: HTMLDivElement;
	let width = $state(800);
	let height = $state(500);

	interface MapNode {
		id: string;
		name: string;
		repo?: Repo;
		hub: boolean;
		x: number;
		y: number;
		r: number;
		color: string;
	}

	interface MapLine {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	let nodes = $state<MapNode[]>([]);
	let lines = $state<MapLine[]>([]);

	const hubNodes = $derived(nodes.filter((n): n is MapNode & { hub: true } => n.hub));
	const leafNodes = $derived(
		nodes.filter((n): n is MapNode & { repo: Repo } => !n.hub && !!n.repo)
	);

	function radiusOf(r: Repo): number {
		if (sizeBy === 'stars') {
			return Math.min(26, Math.max(7, 7 + 4.6 * Math.log10(r.stargazerCount + 1)));
		}
		const m = monthsSincePush(r);
		return Math.min(26, Math.max(7, 7 + 20 / (1 + m)));
	}

	function statusColor(r: Repo): string {
		const id = store.repos[String(r.databaseId)]?.status ?? 'todo';
		return statusById(id)?.color ?? '#818b98';
	}

	function groupOf(r: Repo): string | null {
		if (groupBy === 'none') return null;
		return groupBy === 'language' ? (r.primaryLanguage?.name ?? 'no language') : orgOf(r);
	}

	$effect(() => {
		const el = root;
		if (!el) return;
		const set = () => {
			width = el.clientWidth;
			height = Math.max(380, Math.round(el.clientWidth * 0.58));
		};
		set();
		const ro = new ResizeObserver(set);
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Deterministic layout: a few hundred fixed simulation ticks, no live timer,
	// so the constellation is stable across renders and re-renders.
	$effect(() => {
		const w = width;
		const h = height;
		const list = filteredRepos();
		if (list.length === 0) {
			nodes = [];
			lines = [];
			return;
		}

		const repoNodes: MapNode[] = list.map((r) => ({
			id: `r:${r.databaseId}`,
			name: r.name,
			repo: r,
			hub: false,
			x: 0,
			y: 0,
			r: radiusOf(r),
			color: statusColor(r)
		}));

		const hubs: MapNode[] = [];
		const members = new Map<string, MapNode[]>();
		for (const n of repoNodes) {
			const g = groupOf(n.repo!);
			if (g === null) continue;
			if (!members.has(g)) {
				hubs.push({ id: `h:${g}`, name: g, hub: true, x: 0, y: 0, r: 1, color: '' });
				members.set(g, []);
			}
			members.get(g)!.push(n);
		}

		interface LinkDatum {
			source: string;
			target: string;
			distance: number;
		}
		const links: LinkDatum[] = hubs.flatMap((hub) => {
			const ms = members.get(hub.name) ?? [];
			return ms.map((m) => ({ source: m.id, target: hub.id, distance: m.r + 34 }));
		});

		const simNodes: MapNode[] = [...hubs, ...repoNodes];
		const sim = forceSimulation<MapNode>(simNodes)
			.force(
				'link',
				forceLink<MapNode, LinkDatum>(links)
					.id((d) => d.id)
					.distance((d) => d.distance)
			)
			.force('charge', forceManyBody<MapNode>().strength((d) => (d.hub ? -260 : -30)))
			.force('x', forceX<MapNode>(w / 2).strength((d) => (d.hub ? 0.12 : 0.05)))
			.force('y', forceY<MapNode>(h / 2).strength((d) => (d.hub ? 0.12 : 0.05)))
			.force('collide', forceCollide<MapNode>().radius((d) => d.r + 5).strength(0.85))
			.alpha(0.5)
			.alphaDecay(0.012)
			.stop();
		for (let i = 0; i < 400; i++) sim.tick();

		const settled: MapNode[] = simNodes.map((n) => ({
			id: n.id,
			name: n.name,
			repo: n.repo,
			hub: n.hub,
			x: Math.max(n.r + 22, Math.min(w - n.r - 22, n.x)),
			y: Math.max(n.r + 22, Math.min(h - n.r - 22, n.y)),
			r: n.r,
			color: n.color
		}));

		const byId = new Map(settled.map((n) => [n.id, n]));
		nodes = settled;
		lines = links.flatMap((l) => {
			const s = byId.get(l.source);
			const t = byId.get(l.target);
			if (!s || !t) return [];
			return [{ x1: s.x, y1: s.y, x2: t.x, y2: t.y }];
		});
	});
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
		{#if nodes.length === 0}
			<p class="none">No repos to map.</p>
		{:else}
			<svg
				class="canvas"
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label="Repository status map"
			>
				<defs>
					<filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
						<feDropShadow dx="0" dy="1" stdDeviation="1.6" flood-color="rgba(31,35,40,0.35)" />
					</filter>
				</defs>
				{#each lines as l (l.x1 + ':' + l.y1)}
					<line class="link" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
				{/each}
				{#each hubNodes as n (n.id)}
					<g class="hub">
						<circle cx={n.x} cy={n.y} r={3.5} />
						<text class="hub-label" x={n.x + 10} y={n.y + 4}>{n.name}</text>
					</g>
				{/each}
				{#each leafNodes as n (n.id)}
					<g
						class="bubble"
						role="button"
						tabindex="0"
						onclick={() => (ui.selectedRepo = n.repo)}
						onkeydown={(e) => e.key === 'Enter' && (ui.selectedRepo = n.repo)}
						transform={`translate(${n.x} ${n.y})`}
					>
						<circle class="node" r={n.r} fill={n.color} />
						<text class="node-label" y={-n.r - 8}>{n.name}</text>
						<title>{n.repo.nameWithOwner} · {n.name}</title>
					</g>
				{/each}
			</svg>
		{/if}
	</div>
	<p class="caption">
		Each star is a repo, sized by {sizeBy === 'stars' ? 'stars' : 'how recently it was pushed'},
		colored by status.
	</p>
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
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.link {
		stroke: var(--border);
		stroke-width: 1;
	}
	.hub circle {
		fill: var(--text-dim);
		opacity: 0.55;
	}
	.hub-label {
		fill: var(--text-dim);
		font-size: 12px;
		font-weight: 600;
		pointer-events: none;
		user-select: none;
	}
	.bubble {
		cursor: pointer;
		outline: none;
	}
	.bubble .node {
		stroke: var(--panel);
		stroke-width: 2;
		filter: url(#node-glow);
		transform-box: fill-box;
		transform-origin: center;
		transition: transform 0.12s ease;
	}
	.bubble:hover .node,
	.bubble:focus .node {
		transform: scale(1.18);
	}
	.node-label {
		fill: var(--text);
		font-size: 11px;
		font-weight: 500;
		text-anchor: middle;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s ease;
	}
	.bubble:hover .node-label,
	.bubble:focus .node-label {
		opacity: 1;
	}
	.none {
		margin: 0;
		padding: 60px 0;
		text-align: center;
		color: var(--text-dim);
	}
	.caption {
		margin: 0;
		color: var(--text-dim);
		font-size: 12px;
	}
</style>
